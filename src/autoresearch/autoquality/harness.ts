/**
 * AutoQuality Experiment Harness
 *
 * Runs one-threshold-at-a-time experiments to optimize the Data Quality Score.
 * Each experiment: compute baseline DQS → propose threshold change → run audit
 * in dry-run → compute new DQS → check safety floors → keep/discard.
 */

import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { generateText, isGeminiConfigured, stripCodeFences } from "@/lib/gemini";
import type {
  AutoQualityConfig,
  DqsBreakdown,
  ExperimentResult,
  QualitySafetyFloors,
  OvernightSummary,
} from "../types";
import { DEFAULT_SAFETY_FLOORS } from "../types";
import { logExperiment, buildOvernightSummary, sendOvernightReport } from "../experiment-log";
import { writeOvernightReport, updateCursor } from "../obsidian-reporter";
import type { AuditSummary } from "@/scripts/audit-film-data";

const THRESHOLDS_PATH = join(__dirname, "thresholds.json");
const PROGRAM_PATH = join(__dirname, "program.md");

/** Maximum experiments per weekly run */
const MAX_EXPERIMENTS = 20;

// ---------------------------------------------------------------------------
// DQS Computation
// ---------------------------------------------------------------------------

/**
 * Compute the Data Quality Score from an audit summary.
 *
 * DQS = 100 - (missingTmdb% × 30 + missingPoster% × 25 + missingSynopsis% × 20
 *              + duplicates% × 15 + dodgyEntries% × 10)
 *
 * Note: duplicates% and dodgyEntries% require separate queries;
 * we approximate from audit summary fields when those aren't available.
 */
export function computeDqs(
  summary: AuditSummary,
  duplicateCount = 0,
  dodgyCount = 0
): DqsBreakdown {
  const total = summary.filmsWithUpcoming || 1; // Avoid divide-by-zero

  const missingTmdbPercent = (summary.missingTmdbIdUpcoming / total) * 100;
  const missingPosterPercent = (summary.missingPosterUpcoming / total) * 100;
  const missingSynopsisPercent = (summary.missingSynopsisUpcoming / total) * 100;
  const duplicatesPercent = (duplicateCount / total) * 100;
  const dodgyEntriesPercent = (dodgyCount / total) * 100;

  const compositeScore = Math.max(
    0,
    100 -
      (missingTmdbPercent * 0.3 +
        missingPosterPercent * 0.25 +
        missingSynopsisPercent * 0.2 +
        duplicatesPercent * 0.15 +
        dodgyEntriesPercent * 0.1)
  );

  return {
    missingTmdbPercent,
    missingPosterPercent,
    missingSynopsisPercent,
    duplicatesPercent,
    dodgyEntriesPercent,
    compositeScore,
  };
}

// ---------------------------------------------------------------------------
// Threshold Management
// ---------------------------------------------------------------------------

interface Thresholds {
  tmdb: Record<string, number>;
  duplicateDetection: Record<string, number>;
  dodgyDetection: Record<string, number>;
  nonFilmDetection: Record<string, number>;
  safetyFloors: Record<string, number>;
}

async function loadThresholds(): Promise<Thresholds> {
  const raw = await readFile(THRESHOLDS_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  // Remove $comment key
  delete parsed.$comment;
  return parsed as Thresholds;
}

async function saveThresholds(thresholds: Thresholds): Promise<void> {
  await writeFile(THRESHOLDS_PATH, JSON.stringify(thresholds, null, 2) + "\n", "utf-8");
}

/**
 * Get a nested threshold value by dot-path key (e.g. "tmdb.minMatchConfidence").
 */
function getThresholdValue(thresholds: Thresholds, key: string): number | undefined {
  const [section, field] = key.split(".");
  const sectionData = thresholds[section as keyof Thresholds];
  return sectionData?.[field];
}

/**
 * Set a nested threshold value by dot-path key.
 */
function setThresholdValue(thresholds: Thresholds, key: string, value: number): void {
  const [section, field] = key.split(".");
  const sectionData = thresholds[section as keyof Thresholds];
  if (sectionData) {
    sectionData[field] = value;
  }
}

// ---------------------------------------------------------------------------
// Safety Floor Validation
// ---------------------------------------------------------------------------

/**
 * Check if a proposed threshold change violates safety floors.
 * Returns an error message if violated, null if safe.
 */
function checkSafetyFloors(
  key: string,
  newValue: number,
  floors: QualitySafetyFloors
): string | null {
  if (key === "tmdb.minMatchConfidence" && newValue < floors.minTmdbConfidence) {
    return `TMDB confidence ${newValue} below safety floor ${floors.minTmdbConfidence}`;
  }
  if (key === "duplicateDetection.trigramSimilarityThreshold" && newValue < floors.minAutoMergeSimilarity) {
    return `Trigram similarity ${newValue} below safety floor ${floors.minAutoMergeSimilarity}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Core: Single Experiment
// ---------------------------------------------------------------------------

async function runOneExperiment(
  currentDqs: DqsBreakdown,
  thresholds: Thresholds,
  previousExperiments: string[],
  runAudit: () => Promise<{ summary: AuditSummary; duplicateCount: number; dodgyCount: number }>,
  safetyFloors: QualitySafetyFloors
): Promise<ExperimentResult> {
  const startTime = Date.now();
  let appliedThresholdKey: string | undefined;
  let appliedPreviousValue: number | undefined;

  try {
    // Build prompt
    const template = await readFile(PROGRAM_PATH, "utf-8");
    const prompt = template
      .replace(/\{\{currentDqs\}\}/g, currentDqs.compositeScore.toFixed(0))
      .replace(/\{\{missingTmdbPercent\}\}/g, currentDqs.missingTmdbPercent.toFixed(1))
      .replace(/\{\{missingPosterPercent\}\}/g, currentDqs.missingPosterPercent.toFixed(1))
      .replace(/\{\{missingSynopsisPercent\}\}/g, currentDqs.missingSynopsisPercent.toFixed(1))
      .replace(/\{\{duplicatesPercent\}\}/g, currentDqs.duplicatesPercent.toFixed(1))
      .replace(/\{\{dodgyEntriesPercent\}\}/g, currentDqs.dodgyEntriesPercent.toFixed(1))
      .replace(/\{\{totalFilms\}\}/g, "N/A")
      .replace(/\{\{currentThresholds\}\}/g, JSON.stringify(thresholds, null, 2))
      .replace(
        /\{\{previousExperiments\}\}/g,
        previousExperiments.length > 0
          ? previousExperiments.join("\n")
          : "No previous experiments in this run."
      )
      .replace(/\{\{minTmdbConfidence\}\}/g, String(safetyFloors.minTmdbConfidence))
      .replace(/\{\{minAutoMergeSimilarity\}\}/g, String(safetyFloors.minAutoMergeSimilarity))
      .replace(/\{\{maxNewNonFilmPatterns\}\}/g, String(safetyFloors.maxNewNonFilmPatterns));

    // Ask agent for a threshold change
    const response = await generateText(prompt, {
      systemPrompt: "You are a data quality optimization expert. Output only valid JSON.",
      model: "gemini-3.1-pro-preview",
    });

    const parsed = JSON.parse(stripCodeFences(response));
    const { thresholdKey, previousValue, newValue, reason } = parsed as {
      thresholdKey: string;
      previousValue: number;
      newValue: number;
      reason: string;
    };

    // Validate safety floors
    const safetyViolation = checkSafetyFloors(thresholdKey, newValue, safetyFloors);
    if (safetyViolation) {
      return {
        system: "autoquality",
        configSnapshot: { thresholdKey, previousValue, newValue },
        metricBefore: currentDqs.compositeScore,
        metricAfter: currentDqs.compositeScore,
        kept: false,
        notes: `Safety floor violation: ${safetyViolation}`,
        durationMs: Date.now() - startTime,
      };
    }

    // Verify the previous value matches what we have
    const actualPrevious = getThresholdValue(thresholds, thresholdKey);
    if (actualPrevious !== undefined && actualPrevious !== previousValue) {
      console.warn(
        `[autoquality] Agent claimed ${thresholdKey} was ${previousValue}, actual is ${actualPrevious}`
      );
    }

    // Apply the threshold change (track for rollback in catch)
    setThresholdValue(thresholds, thresholdKey, newValue);
    appliedThresholdKey = thresholdKey;
    appliedPreviousValue = actualPrevious ?? previousValue;
    await saveThresholds(thresholds);

    // Run audit with modified thresholds
    const auditResult = await runAudit();
    const newDqs = computeDqs(auditResult.summary, auditResult.duplicateCount, auditResult.dodgyCount);

    const improved = newDqs.compositeScore > currentDqs.compositeScore;

    if (!improved) {
      // Revert
      setThresholdValue(thresholds, thresholdKey, actualPrevious ?? previousValue);
      await saveThresholds(thresholds);
    }

    const config: AutoQualityConfig = {
      thresholdKey,
      previousValue: actualPrevious ?? previousValue,
      newValue,
    };

    const result: ExperimentResult = {
      system: "autoquality",
      configSnapshot: config,
      metricBefore: currentDqs.compositeScore,
      metricAfter: newDqs.compositeScore,
      kept: improved,
      notes: improved
        ? `DQS improved: ${currentDqs.compositeScore.toFixed(1)} → ${newDqs.compositeScore.toFixed(1)} (${thresholdKey}: ${actualPrevious ?? previousValue} → ${newValue}). ${reason}`
        : `DQS did not improve: ${currentDqs.compositeScore.toFixed(1)} → ${newDqs.compositeScore.toFixed(1)} (reverted ${thresholdKey})`,
      durationMs: Date.now() - startTime,
    };

    console.log(
      `[autoquality] ${improved ? "KEPT" : "DISCARDED"}: ${result.notes}`
    );

    return result;
  } catch (err) {
    // Restore threshold if we modified it before the failure
    if (appliedThresholdKey !== undefined && appliedPreviousValue !== undefined) {
      setThresholdValue(thresholds, appliedThresholdKey, appliedPreviousValue);
      await saveThresholds(thresholds).catch(() => {});
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[autoquality] Experiment failed:`, errorMsg);

    return {
      system: "autoquality",
      configSnapshot: { thresholdKey: "unknown", previousValue: 0, newValue: 0 },
      metricBefore: currentDqs.compositeScore,
      metricAfter: currentDqs.compositeScore,
      kept: false,
      notes: `Experiment failed: ${errorMsg}`,
      durationMs: Date.now() - startTime,
    };
  }
}

// ---------------------------------------------------------------------------
// Core: Weekly Run
// ---------------------------------------------------------------------------

/**
 * Run the full AutoQuality experiment loop.
 *
 * @param runAudit - Function that executes the audit pipeline and returns metrics.
 *   Injected to allow dry-run and testing.
 */
export async function runAutoQualityWeekly(
  runAudit: () => Promise<{ summary: AuditSummary; duplicateCount: number; dodgyCount: number }>,
  safetyFloors: QualitySafetyFloors = DEFAULT_SAFETY_FLOORS
): Promise<OvernightSummary> {
  const runStartedAt = new Date();

  if (!isGeminiConfigured()) {
    console.error("[autoquality] GEMINI_API_KEY not configured — aborting");
    return buildOvernightSummary("autoquality", runStartedAt, new Date(), new Map());
  }

  // Load current thresholds
  const thresholds = await loadThresholds();

  // Compute baseline DQS
  const baselineAudit = await runAudit();
  let currentDqs = computeDqs(baselineAudit.summary, baselineAudit.duplicateCount, baselineAudit.dodgyCount);

  console.log(`[autoquality] Baseline DQS: ${currentDqs.compositeScore.toFixed(1)}`);

  const results: ExperimentResult[] = [];
  const previousExperiments: string[] = [];

  for (let i = 1; i <= MAX_EXPERIMENTS; i++) {
    console.log(`\n[autoquality] Experiment ${i}/${MAX_EXPERIMENTS}`);

    const result = await runOneExperiment(
      currentDqs,
      thresholds,
      previousExperiments,
      runAudit,
      safetyFloors
    );

    results.push(result);
    await logExperiment(result);

    // Track for context in subsequent experiments
    previousExperiments.push(
      `Experiment ${i}: ${result.kept ? "KEPT" : "DISCARDED"} — ${result.notes}`
    );

    // Update current DQS if kept — recompute full breakdown from fresh audit
    if (result.kept) {
      const freshAudit = await runAudit();
      currentDqs = computeDqs(freshAudit.summary, freshAudit.duplicateCount, freshAudit.dodgyCount);
    }

    // Stop early if DQS is very high (diminishing returns)
    if (currentDqs.compositeScore >= 95) {
      console.log("[autoquality] DQS >= 95 — stopping (diminishing returns)");
      break;
    }
  }

  // Build and send summary
  const resultsByTarget = new Map<string, { name: string; results: ExperimentResult[] }>();
  resultsByTarget.set("data-quality", { name: "Data Quality Score", results });

  const summary = buildOvernightSummary("autoquality", runStartedAt, new Date(), resultsByTarget);
  await sendOvernightReport(summary);

  // Write Obsidian report and update cursor
  try {
    await writeOvernightReport(summary, results);
    await updateCursor(summary);
  } catch (err) {
    console.error("[autoquality] Failed to write Obsidian report:", err);
  }

  return summary;
}
