/**
 * AutoQuality Experiment Harness
 *
 * Runs one-threshold-at-a-time experiments to optimize the Data Quality Score.
 * Each experiment: compute baseline DQS → propose threshold change → run audit
 * in dry-run → compute new DQS → check safety floors → keep/discard.
 */

import { readFile } from "fs/promises";
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
import { loadThresholdsFromDb, saveThresholdsToDb } from "./db-thresholds";
import { saveDqsSnapshot, loadDqsTrend, formatDqsTrend } from "./dqs-snapshots";
import { runSpotChecks, formatSpotChecks } from "./spot-checks";
import type { Thresholds } from "./load-thresholds";
import { db, isDatabaseAvailable } from "@/db";
import { autoresearchExperiments } from "@/db/schema/admin";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

const PROGRAM_PATH = join(__dirname, "program.md");

/** Maximum experiments per weekly run (kept low for one-at-a-time + cross-run memory).
 * Reduced from 5 to 3 to limit Supabase egress — each experiment runs a full audit pass. */
const MAX_EXPERIMENTS = 3;

// ---------------------------------------------------------------------------
// DQS Computation
// ---------------------------------------------------------------------------

/**
 * Compute the Data Quality Score from an audit summary.
 *
 * DQS = 100 - (missingTmdb% × 0.30 + missingPoster% × 0.25 + missingSynopsis% × 0.20
 *              + duplicates% × 0.15 + dodgyEntries% × 0.10)
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

// Uses Thresholds from ./load-thresholds (canonical type).
// Dynamic access via getThresholdValue/setThresholdValue uses Record casts.

async function loadProgramTemplate(): Promise<string> {
  try {
    return await readFile(PROGRAM_PATH, "utf-8");
  } catch {
    // the cloud orchestrator cloud: .md file not available — use inline template
    return FALLBACK_PROGRAM_TEMPLATE;
  }
}

/**
 * Fill the experiment prompt template with current DQS metrics, thresholds,
 * experiment history, and safety floors.
 */
async function buildExperimentPrompt(
  currentDqs: DqsBreakdown,
  thresholds: Thresholds,
  previousExperiments: string[],
  safetyFloors: QualitySafetyFloors
): Promise<string> {
  const template = await loadProgramTemplate();
  return template
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
}

const FALLBACK_PROGRAM_TEMPLATE = `# AutoQuality Agent Instructions

You are a data quality optimization agent for pictures.london, a London cinema calendar.

## Your Task

Propose ONE threshold change that will improve the Data Quality Score (DQS). You must change exactly one threshold — the isolation principle ensures we can attribute improvements to specific changes.

**IMPORTANT: You may ONLY change TMDB-related thresholds.** The TMDB matching pipeline is the highest-impact lever for DQS improvement (30% weight). Focus exclusively on:

- \`tmdb.minMatchConfidence\` — Minimum confidence to auto-apply a TMDB match
- \`tmdb.minTitleSimilarity\` — Minimum Levenshtein similarity for title comparison
- \`tmdb.titleSimilarityWeight\` — Weight given to title similarity in overall match score
- \`tmdb.competitorThresholdRatio\` — How much better the top match must be vs runner-up
- \`tmdb.yearMatchPenaltyRecovery\` — How much to recover when year matches after penalizing

Do NOT propose changes to \`duplicateDetection\`, \`dodgyDetection\`, \`nonFilmDetection\`, or \`safetyFloors\` thresholds.

## Current State

- **Data Quality Score**: {{currentDqs}}/100
- **Missing TMDB %**: {{missingTmdbPercent}}%
- **Missing Poster %**: {{missingPosterPercent}}%
- **Missing Synopsis %**: {{missingSynopsisPercent}}%
- **Duplicates %**: {{duplicatesPercent}}%
- **Dodgy Entries %**: {{dodgyEntriesPercent}}%
- **Total Films (upcoming)**: {{totalFilms}}

## Current Thresholds

\`\`\`json
{{currentThresholds}}
\`\`\`

## Previous Experiments

{{previousExperiments}}

## DQS Formula

\`\`\`
DQS = 100 - (missingTmdb% * 0.30 + missingPoster% * 0.25 + missingSynopsis% * 0.20
             + duplicates% * 0.15 + dodgyEntries% * 0.10)
\`\`\`

## Safety Floors (MUST NOT VIOLATE)

- \`tmdb.minMatchConfidence\` must stay >= {{minTmdbConfidence}}
- \`duplicateDetection.trigramSimilarityThreshold\` must stay >= {{minAutoMergeSimilarity}} for auto-merge
- Maximum {{maxNewNonFilmPatterns}} new non-film patterns per experiment

## Strategy Tips

- Missing TMDB has the highest weight (0.30). Even a 1% reduction in missingTmdb% = +0.3 DQS points.
- If previous experiments show a threshold was already tried and discarded, try a different threshold or direction.

## Rules

1. Output ONLY a JSON object with your proposed change — no explanations
2. Change exactly ONE threshold key (must be from the \`tmdb.*\` section)
3. Explain WHY this change should improve DQS in the \`reason\` field
4. The new value must respect the safety floors above
5. Consider which DQS component has the most room for improvement
6. Small changes (5-15%) are preferred over large jumps
7. Review previous experiments to avoid repeating failed changes

## Expected Output Format

\`\`\`json
{
  "thresholdKey": "tmdb.minMatchConfidence",
  "previousValue": 0.6,
  "newValue": 0.55,
  "reason": "Lowering TMDB confidence threshold should match more films, reducing missingTmdb% (currently the largest DQS penalty at 30% weight)"
}
\`\`\`
`;

/**
 * Get a nested threshold value by dot-path key (e.g. "tmdb.minMatchConfidence").
 */
function getThresholdValue(thresholds: Thresholds, key: string): number | undefined {
  const [section, field] = key.split(".");
  const sectionData = thresholds[section as keyof Thresholds] as Record<string, number> | undefined;
  return sectionData?.[field];
}

/**
 * Set a nested threshold value by dot-path key.
 */
function setThresholdValue(thresholds: Thresholds, key: string, value: number): void {
  const [section, field] = key.split(".");
  const sectionData = thresholds[section as keyof Thresholds] as Record<string, number> | undefined;
  if (!sectionData) {
    throw new Error(
      `[autoquality] Invalid threshold key "${key}" — section "${section}" not found. Valid sections: ${Object.keys(thresholds).join(", ")}`
    );
  }
  sectionData[field] = value;
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
    // Build prompt from template + current metrics
    const prompt = await buildExperimentPrompt(currentDqs, thresholds, previousExperiments, safetyFloors);

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

    // Enforce TMDB-only constraint (Phase 2: overfit on highest-impact lever)
    if (!thresholdKey.startsWith("tmdb.")) {
      console.warn(`[autoquality] Agent proposed non-TMDB key "${thresholdKey}" — rejecting`);
      return {
        system: "autoquality",
        configSnapshot: { thresholdKey, previousValue, newValue },
        metricBefore: currentDqs.compositeScore,
        metricAfter: currentDqs.compositeScore,
        kept: false,
        notes: `Rejected: "${thresholdKey}" is not a TMDB threshold (currently restricted to tmdb.* only)`,
        durationMs: Date.now() - startTime,
      };
    }

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
    await saveThresholdsToDb(thresholds);

    // Run audit with modified thresholds
    const auditResult = await runAudit();
    const newDqs = computeDqs(auditResult.summary, auditResult.duplicateCount, auditResult.dodgyCount);

    const improved = newDqs.compositeScore > currentDqs.compositeScore;

    if (!improved) {
      // Revert
      setThresholdValue(thresholds, thresholdKey, actualPrevious ?? previousValue);
      await saveThresholdsToDb(thresholds);
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
      try {
        await saveThresholdsToDb(thresholds);
      } catch (saveErr) {
        console.error(
          `[autoquality] CRITICAL: Failed to save reverted thresholds to DB. DB thresholds may contain experimental value for ${appliedThresholdKey}:`,
          saveErr instanceof Error ? saveErr.message : saveErr
        );
      }
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
// Cross-Run Learning
// ---------------------------------------------------------------------------

/**
 * Load experiment history from previous runs (across container lifetimes).
 * This is the key Karpathy insight: the agent needs to see what was tried
 * before to avoid repeating failed experiments.
 */
async function loadCrossRunHistory(): Promise<string[]> {
  if (!isDatabaseAvailable) return [];

  try {
    const history = await db
      .select({
        createdAt: autoresearchExperiments.createdAt,
        configSnapshot: autoresearchExperiments.configSnapshot,
        metricBefore: autoresearchExperiments.metricBefore,
        metricAfter: autoresearchExperiments.metricAfter,
        kept: autoresearchExperiments.kept,
      })
      .from(autoresearchExperiments)
      .where(eq(autoresearchExperiments.system, "autoquality"))
      .orderBy(desc(autoresearchExperiments.createdAt))
      .limit(20);

    if (history.length === 0) return [];

    // Format as structured context for the agent (newest first → reverse to chronological)
    const lines = history.reverse().map((exp) => {
      const date = exp.createdAt.toISOString().slice(0, 10);
      const config = exp.configSnapshot as { thresholdKey?: string; previousValue?: number; newValue?: number };
      const key = config.thresholdKey ?? "unknown";
      const prev = config.previousValue ?? "?";
      const next = config.newValue ?? "?";
      const status = exp.kept ? "KEPT" : "DISCARDED";
      return `- ${date}: Changed ${key} ${prev}→${next}, DQS ${exp.metricBefore.toFixed(1)}→${exp.metricAfter.toFixed(1)} (${status})`;
    });

    return [`Previous experiments (across all runs):`, ...lines];
  } catch (err) {
    console.warn("[autoquality] Failed to load cross-run history:", err);
    return [];
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
  const runId = randomUUID();

  if (!isGeminiConfigured()) {
    console.error("[autoquality] GEMINI_API_KEY not configured — aborting");
    return buildOvernightSummary("autoquality", runStartedAt, new Date(), new Map());
  }

  // Load current thresholds from DB (falls back to bundled defaults)
  const thresholds = await loadThresholdsFromDb();

  // Compute baseline DQS
  const baselineAudit = await runAudit();
  let currentDqs = computeDqs(baselineAudit.summary, baselineAudit.duplicateCount, baselineAudit.dodgyCount);

  console.log(`[autoquality] Baseline DQS: ${currentDqs.compositeScore.toFixed(1)}`);

  // Save start snapshot for DQS time-series
  await saveDqsSnapshot(runId, "start", currentDqs, baselineAudit.summary.filmsWithUpcoming);

  const results: ExperimentResult[] = [];

  // Load cross-run experiment history so the agent learns from previous runs
  const previousExperiments = await loadCrossRunHistory();

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

  // Save end snapshot for DQS time-series
  await saveDqsSnapshot(runId, "end", currentDqs, baselineAudit.summary.filmsWithUpcoming);

  // Build and send summary (with DQS trend)
  const resultsByTarget = new Map<string, { name: string; results: ExperimentResult[] }>();
  resultsByTarget.set("data-quality", { name: "Data Quality Score", results });

  const summary = buildOvernightSummary("autoquality", runStartedAt, new Date(), resultsByTarget);

  // Load DQS trend and run spot-checks for the Telegram report
  const trend = await loadDqsTrend(4);
  const trendLines = formatDqsTrend(trend);

  const spotCheckResults = await runSpotChecks();
  const spotCheckLines = spotCheckResults ? formatSpotChecks(spotCheckResults) : [];

  const reportSent = await sendOvernightReport(summary, [...trendLines, ...spotCheckLines]);
  if (!reportSent) console.warn("[autoquality] Failed to send Telegram overnight report");

  // Write Obsidian report and update cursor
  try {
    await writeOvernightReport(summary, results);
  } catch (err) {
    console.error("[autoquality] Failed to write Obsidian report:", err);
  }
  try {
    await updateCursor(summary);
  } catch (err) {
    console.error("[autoquality] Failed to update Obsidian cursor:", err);
  }

  return summary;
}
