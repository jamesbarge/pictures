/**
 * AutoScrape Experiment Harness
 *
 * The core iterate-evaluate-keep/discard loop for scraper repair.
 * Maps to autoresearch's 3-file pattern:
 *   prepare.py → BaseScraper + runner-factory (stable)
 *   train.py   → Config overlay JSON (agent-modifiable)
 *   program.md → Agent instructions template
 *
 * One "5-minute experiment":
 *   0:00-0:30  Detect broken scraper (yield < 50 or anomaly)
 *   0:30-1:30  Fetch HTML, diff against last snapshot
 *   1:30-3:00  Agent generates candidate config overlay
 *   3:00-4:30  Run scraper with candidate config (dry-run yield)
 *   4:30-5:00  Keep if yield improves; discard otherwise
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { generateText, isGeminiConfigured, stripCodeFences } from "@/lib/gemini";
import { db, isDatabaseAvailable } from "@/db";
import { cinemas } from "@/db/schema";
import { cinemaBaselines, scraperRuns, autoresearchConfig } from "@/db/schema/admin";
import { eq, desc } from "drizzle-orm";
import type {
  AutoScrapeConfig,
  ExperimentResult,
  YieldScoreBreakdown,
  OvernightSummary,
} from "../types";
import { logExperiment, buildOvernightSummary, sendOvernightReport } from "../experiment-log";
import { writeOvernightReport, updateCursor } from "../obsidian-reporter";
import { computeYieldScore, buildYieldInput } from "./yield-scorer";
import {
  captureSnapshot,
  saveSnapshot,
  loadLatestSnapshot,
  diffSnapshots,
  extractRelevantHtml,
} from "./html-snapshotter";
import { runScraperForYield, type SingleVenueConfig } from "@/scrapers/runner-factory";
import type { ConfigOverlay } from "@/scrapers/base";

const OVERLAY_DIR = join(process.cwd(), ".autoresearch", "overlays");
const PROGRAM_PATH = join(__dirname, "program.md");

/** Maximum experiments per cinema per overnight run */
const MAX_EXPERIMENTS_PER_CINEMA = 12;

/** Yield threshold below which a scraper is considered broken */
const BROKEN_YIELD_THRESHOLD = 50;

/** Yield threshold for "recovered" classification */
const RECOVERY_YIELD_THRESHOLD = 70;

// ---------------------------------------------------------------------------
// Template Loading (cloud-safe)
// ---------------------------------------------------------------------------

async function loadProgramTemplate(): Promise<string> {
  try {
    return await readFile(PROGRAM_PATH, "utf-8");
  } catch {
    return FALLBACK_PROGRAM_TEMPLATE;
  }
}

const FALLBACK_PROGRAM_TEMPLATE = `# AutoScrape Agent Instructions

You are an autonomous scraper repair agent for pictures.london, a London cinema calendar.

## Your Task

The scraper for **{{cinemaName}}** (\`{{cinemaId}}\`) is underperforming. Your job is to propose a new config overlay with CSS selector and/or URL changes that will improve the scraper's yield score.

## Current State

- **Current Yield Score**: {{currentYield}}/100
- **Screenings Found**: {{screeningsFound}} (baseline expected: {{baselineExpected}})
- **Valid Time %**: {{validTimePercent}}%
- **TMDB Match Rate**: {{tmdbMatchRate}}%
- **Booking URL Valid %**: {{bookingUrlValidRate}}%
- **Scraper Type**: {{scraperType}}
- **Base URL**: {{baseUrl}}

## What Broke

{{breakageAnalysis}}

### Broken Selectors
{{brokenSelectors}}

### Candidate Selectors Found in Current HTML
{{candidateSelectors}}

## Current HTML Excerpt

Below is a trimmed excerpt of the cinema's current listing page HTML. Use this to identify the correct CSS selectors for screening data.

\`\`\`html
{{htmlExcerpt}}
\`\`\`

## Previous Config (if any)

\`\`\`json
{{previousConfig}}
\`\`\`

## Rules

1. Output ONLY a JSON config overlay — no explanations, no markdown, just JSON
2. Use standard CSS selectors that cheerio/jQuery can parse
3. The selectors must extract: film titles, screening datetimes, and booking URLs
4. Prefer specific selectors (class names, data attributes) over generic ones (tag + nth-child)
5. If the HTML structure is completely unrecognizable, output \`{"status": "unrecoverable"}\` — do not guess
6. Do not invent URLs — only use URL patterns visible in the HTML excerpt

## Expected Output Format

\`\`\`json
{
  "selectorOverrides": {
    "filmTitle": "CSS selector for film title elements",
    "datetime": "CSS selector for datetime elements",
    "bookingUrl": "CSS selector for booking link elements",
    "screeningContainer": "CSS selector for the container wrapping each screening"
  },
  "urlOverrides": {
    "listingPage": "full URL if the listing page URL changed"
  },
  "dateFormatOverrides": {
    "datePattern": "e.g., dd/MM/yyyy or MMMM d, yyyy"
  },
  "agentNotes": "Brief explanation of what changed and why these selectors should work"
}
\`\`\`

Only include keys that need to change. Omit keys that should stay at their defaults.
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrokenScraper {
  cinemaId: string;
  cinemaName: string;
  currentYield: YieldScoreBreakdown;
  baselineExpected: number;
  baseUrl: string;
}

interface ScraperFactory {
  cinemaId: string;
  createConfig: () => Promise<SingleVenueConfig>;
}

// ---------------------------------------------------------------------------
// Core: Single Experiment
// ---------------------------------------------------------------------------

/**
 * Run a single experiment for one cinema.
 * Returns the experiment result (kept/discarded + metrics).
 */
async function runOneExperiment(
  scraper: ScraperFactory,
  cinema: BrokenScraper,
  experimentNumber: number
): Promise<ExperimentResult> {
  const startTime = Date.now();
  let tokensUsed = 0;
  let previousOverlay: string | null = null;
  let wroteCandidate = false;

  console.log(
    `[autoscrape] ${cinema.cinemaName} — experiment ${experimentNumber} (current yield: ${cinema.currentYield.compositeScore.toFixed(0)})`
  );

  try {
    // Step 1: Capture current HTML and diff against previous snapshot
    const currentSnapshot = await captureSnapshot(cinema.cinemaId, cinema.baseUrl);
    const previousSnapshot = await loadLatestSnapshot(cinema.cinemaId);

    let breakageAnalysis = "No previous snapshot — first analysis.";
    let brokenSelectors = "None identified";
    let candidateSelectors = "None identified";

    if (previousSnapshot) {
      const diff = diffSnapshots(previousSnapshot, currentSnapshot);
      breakageAnalysis = diff.changeSummary;
      brokenSelectors = diff.brokenSelectors.length > 0
        ? diff.brokenSelectors.join("\n")
        : "None — selectors may still work but produce wrong data";
      candidateSelectors = diff.candidateSelectors.length > 0
        ? diff.candidateSelectors.join("\n")
        : "No obvious screening container patterns found";
    }

    // Save current snapshot for next experiment's diffing
    await saveSnapshot(currentSnapshot);

    // Step 2: Load program template and fill in variables
    const htmlExcerpt = extractRelevantHtml(
      currentSnapshot.html,
      previousSnapshot?.activeSelectors
        ? Object.values(previousSnapshot.activeSelectors)
        : []
    );

    previousOverlay = await loadCurrentOverlay(cinema.cinemaId);

    const prompt = await buildPrompt({
      cinemaId: cinema.cinemaId,
      cinemaName: cinema.cinemaName,
      currentYield: cinema.currentYield,
      screeningsFound: 0, // Will be from the latest run
      baselineExpected: cinema.baselineExpected,
      baseUrl: cinema.baseUrl,
      breakageAnalysis,
      brokenSelectors,
      candidateSelectors,
      htmlExcerpt,
      previousConfig: previousOverlay,
    });

    // Step 3: Ask the agent to generate a candidate config
    const response = await generateText(prompt, {
      systemPrompt: "You are a web scraping expert. Output only valid JSON.",
      model: "gemini-3.1-pro-preview",
    });
    tokensUsed += response.length; // Rough estimate; real token count from generateTextWithUsage

    const candidateJson = stripCodeFences(response);
    const candidate = JSON.parse(candidateJson);

    // Check if agent says unrecoverable
    if (candidate.status === "unrecoverable") {
      return {
        system: "autoscrape",
        configSnapshot: { cinemaId: cinema.cinemaId, selectorOverrides: {} },
        metricBefore: cinema.currentYield.compositeScore,
        metricAfter: cinema.currentYield.compositeScore,
        kept: false,
        notes: "Agent determined cinema page is unrecoverable",
        durationMs: Date.now() - startTime,
        tokensUsed,
      };
    }

    // Step 4: Write candidate overlay to disk and run scraper
    const overlay: ConfigOverlay = {
      selectorOverrides: candidate.selectorOverrides,
      urlOverrides: candidate.urlOverrides,
      dateFormatOverrides: candidate.dateFormatOverrides,
    };
    await writeOverlay(cinema.cinemaId, overlay);
    wroteCandidate = true;

    const scraperConfig = await scraper.createConfig();
    const yieldResult = await runScraperForYield(scraperConfig);

    // Step 5: Compute yield score for the candidate
    const candidateYield = computeYieldScore(
      buildYieldInput({
        cinemaId: cinema.cinemaId,
        screenings: yieldResult.screenings.map((s) => ({
          filmTitle: s.filmTitle,
          datetime: s.datetime,
          bookingUrl: s.bookingUrl,
        })),
        baselineExpected: cinema.baselineExpected,
        tmdbMatchedTitles: new Set(), // TODO: load from DB in full implementation
      })
    );

    // Step 6: Keep/discard decision
    const improved = candidateYield.compositeScore > cinema.currentYield.compositeScore;
    const recovered =
      candidateYield.compositeScore > RECOVERY_YIELD_THRESHOLD &&
      cinema.currentYield.compositeScore < BROKEN_YIELD_THRESHOLD;
    const kept = improved || recovered;

    if (!kept) {
      // Revert: remove the overlay (or restore previous)
      if (previousOverlay) {
        await writeOverlay(cinema.cinemaId, JSON.parse(previousOverlay));
      } else {
        await removeOverlay(cinema.cinemaId);
      }
    }

    const config: AutoScrapeConfig = {
      cinemaId: cinema.cinemaId,
      selectorOverrides: candidate.selectorOverrides ?? {},
      urlOverrides: candidate.urlOverrides,
      dateFormatOverrides: candidate.dateFormatOverrides,
      agentNotes: candidate.agentNotes,
    };

    const result: ExperimentResult = {
      system: "autoscrape",
      configSnapshot: config,
      metricBefore: cinema.currentYield.compositeScore,
      metricAfter: candidateYield.compositeScore,
      kept,
      notes: kept
        ? `Yield improved: ${cinema.currentYield.compositeScore.toFixed(0)} → ${candidateYield.compositeScore.toFixed(0)}`
        : `Yield did not improve: ${cinema.currentYield.compositeScore.toFixed(0)} → ${candidateYield.compositeScore.toFixed(0)} (discarded)`,
      durationMs: Date.now() - startTime,
      tokensUsed,
    };

    console.log(
      `[autoscrape] ${cinema.cinemaName} — ${kept ? "KEPT" : "DISCARDED"}: ${result.notes}`
    );

    return result;
  } catch (err) {
    // Restore previous overlay if we wrote a candidate during this experiment
    if (wroteCandidate) {
      try {
        if (previousOverlay) {
          await writeOverlay(cinema.cinemaId, JSON.parse(previousOverlay));
        } else {
          await removeOverlay(cinema.cinemaId);
        }
      } catch (restoreErr) {
        console.error(
          `[autoscrape] CRITICAL: Failed to restore overlay for ${cinema.cinemaId} — broken candidate may still be on disk:`,
          restoreErr instanceof Error ? restoreErr.message : restoreErr
        );
      }
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[autoscrape] ${cinema.cinemaName} — experiment failed:`, errorMsg);

    return {
      system: "autoscrape",
      configSnapshot: { cinemaId: cinema.cinemaId, selectorOverrides: {} },
      metricBefore: cinema.currentYield.compositeScore,
      metricAfter: cinema.currentYield.compositeScore,
      kept: false,
      notes: `Experiment failed: ${errorMsg}`,
      durationMs: Date.now() - startTime,
      tokensUsed,
    };
  }
}

// ---------------------------------------------------------------------------
// Core: Overnight Run
// ---------------------------------------------------------------------------

/**
 * Run the full overnight AutoScrape loop.
 * Detects broken scrapers, runs experiments, sends summary.
 */
export async function runAutoScrapeOvernight(
  scraperFactories: ScraperFactory[]
): Promise<OvernightSummary> {
  const runStartedAt = new Date();

  if (!isGeminiConfigured()) {
    console.error("[autoscrape] GEMINI_API_KEY not configured — aborting");
    return buildOvernightSummary("autoscrape", runStartedAt, new Date(), new Map());
  }

  // Step 1: Detect broken scrapers
  const brokenScrapers = await detectBrokenScrapers(scraperFactories);

  if (brokenScrapers.length === 0) {
    console.log("[autoscrape] All scrapers healthy — nothing to do");
    const summary = buildOvernightSummary("autoscrape", runStartedAt, new Date(), new Map());
    const sent = await sendOvernightReport(summary);
    if (!sent) console.warn("[autoscrape] Failed to send Telegram overnight report");
    return summary;
  }

  console.log(`[autoscrape] Found ${brokenScrapers.length} broken scrapers`);

  // Step 2: Run experiments for each broken scraper
  const resultsByTarget = new Map<string, { name: string; results: ExperimentResult[] }>();

  for (const { broken, factory } of brokenScrapers) {
    const results: ExperimentResult[] = [];
    let currentYield = broken.currentYield;

    for (let i = 1; i <= MAX_EXPERIMENTS_PER_CINEMA; i++) {
      const result = await runOneExperiment(factory, { ...broken, currentYield }, i);
      results.push(result);

      // Log each experiment to DB
      await logExperiment(result);

      // If kept, update current yield for next experiment
      if (result.kept) {
        // Re-evaluate after keeping the change
        currentYield = {
          ...currentYield,
          compositeScore: result.metricAfter,
        };
      }

      // Stop early if we've recovered
      if (currentYield.compositeScore >= RECOVERY_YIELD_THRESHOLD) {
        console.log(`[autoscrape] ${broken.cinemaName} — recovered! Stopping experiments.`);
        break;
      }
    }

    resultsByTarget.set(broken.cinemaId, { name: broken.cinemaName, results });
  }

  // Step 3: Build and send overnight summary
  const summary = buildOvernightSummary(
    "autoscrape",
    runStartedAt,
    new Date(),
    resultsByTarget
  );
  const reportSent = await sendOvernightReport(summary);
  if (!reportSent) console.warn("[autoscrape] Failed to send Telegram overnight report");

  // Step 4: Write Obsidian report and update cursor
  const allExperiments = [...resultsByTarget.values()].flatMap((t) => t.results);
  try {
    await writeOvernightReport(summary, allExperiments);
  } catch (err) {
    console.error("[autoscrape] Failed to write Obsidian report:", err);
  }
  try {
    await updateCursor(summary);
  } catch (err) {
    console.error("[autoscrape] Failed to update Obsidian cursor:", err);
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect which scrapers are underperforming and need experiments.
 */
async function detectBrokenScrapers(
  factories: ScraperFactory[]
): Promise<Array<{ broken: BrokenScraper; factory: ScraperFactory }>> {
  const broken: Array<{ broken: BrokenScraper; factory: ScraperFactory }> = [];

  for (const factory of factories) {
    try {
      // Get cinema info
      const [cinema] = await db
        .select()
        .from(cinemas)
        .where(eq(cinemas.id, factory.cinemaId))
        .limit(1);

      if (!cinema) continue;

      // Get baseline
      const [baseline] = await db
        .select()
        .from(cinemaBaselines)
        .where(eq(cinemaBaselines.cinemaId, factory.cinemaId))
        .limit(1);

      const baselineExpected = baseline
        ? (baseline.weekdayAvg ?? baseline.weekendAvg ?? 20)
        : 20;

      // Get most recent scraper run
      const [latestRun] = await db
        .select()
        .from(scraperRuns)
        .where(eq(scraperRuns.cinemaId, factory.cinemaId))
        .orderBy(desc(scraperRuns.createdAt))
        .limit(1);

      if (!latestRun) continue;

      // Compute current yield score (simplified — using run data)
      const screeningsFound = latestRun.screeningCount ?? 0;
      const currentYield = computeYieldScore({
        cinemaId: factory.cinemaId,
        screeningsFound,
        baselineExpected,
        validTimeCount: screeningsFound, // Assume valid for detection phase
        totalWithTime: screeningsFound,
        tmdbMatchedCount: 0, // Unknown at detection time
        totalFilms: 1,
        validBookingUrls: screeningsFound,
        totalBookingUrls: screeningsFound,
      });

      // Is it broken?
      const isBroken =
        currentYield.compositeScore < BROKEN_YIELD_THRESHOLD ||
        latestRun.status === "failed" ||
        latestRun.status === "anomaly";

      if (isBroken) {
        broken.push({
          broken: {
            cinemaId: factory.cinemaId,
            cinemaName: cinema.name,
            currentYield,
            baselineExpected,
            baseUrl: cinema.website ?? "",
          },
          factory,
        });
      }
    } catch (err) {
      console.error(`[autoscrape] Error checking ${factory.cinemaId}:`, err);
    }
  }

  return broken;
}

/**
 * Build the agent prompt from the program.md template.
 */
async function buildPrompt(vars: {
  cinemaId: string;
  cinemaName: string;
  currentYield: YieldScoreBreakdown;
  screeningsFound: number;
  baselineExpected: number;
  baseUrl: string;
  breakageAnalysis: string;
  brokenSelectors: string;
  candidateSelectors: string;
  htmlExcerpt: string;
  previousConfig: string | null;
}): Promise<string> {
  const template = await loadProgramTemplate();

  return template
    .replace(/\{\{cinemaId\}\}/g, vars.cinemaId)
    .replace(/\{\{cinemaName\}\}/g, vars.cinemaName)
    .replace(/\{\{currentYield\}\}/g, vars.currentYield.compositeScore.toFixed(0))
    .replace(/\{\{screeningsFound\}\}/g, String(vars.screeningsFound))
    .replace(/\{\{baselineExpected\}\}/g, String(vars.baselineExpected))
    .replace(/\{\{validTimePercent\}\}/g, vars.currentYield.validTimePercent.toFixed(0))
    .replace(/\{\{tmdbMatchRate\}\}/g, vars.currentYield.tmdbMatchRate.toFixed(0))
    .replace(/\{\{bookingUrlValidRate\}\}/g, vars.currentYield.bookingUrlValidRate.toFixed(0))
    .replace(/\{\{scraperType\}\}/g, "cheerio") // Default; can be extended
    .replace(/\{\{baseUrl\}\}/g, vars.baseUrl)
    .replace(/\{\{breakageAnalysis\}\}/g, vars.breakageAnalysis)
    .replace(/\{\{brokenSelectors\}\}/g, vars.brokenSelectors)
    .replace(/\{\{candidateSelectors\}\}/g, vars.candidateSelectors)
    .replace(/\{\{htmlExcerpt\}\}/g, vars.htmlExcerpt)
    .replace(/\{\{previousConfig\}\}/g, vars.previousConfig ?? "No previous config");
}

/**
 * Load the current config overlay for a cinema as a JSON string.
 * Checks DB first (persists across Trigger.dev deploys), falls back to filesystem.
 */
async function loadCurrentOverlay(cinemaId: string): Promise<string | null> {
  const dbKey = `autoscrape/overlay/${cinemaId}`;

  // Try DB first
  if (isDatabaseAvailable) {
    try {
      const [row] = await db
        .select()
        .from(autoresearchConfig)
        .where(eq(autoresearchConfig.key, dbKey))
        .limit(1);

      if (row) {
        return JSON.stringify(row.value);
      }
    } catch (err) {
      console.warn(`[autoscrape] Failed to load overlay from DB for ${cinemaId}:`, err);
    }
  }

  // Fall back to filesystem (local dev)
  try {
    const overlayPath = join(OVERLAY_DIR, `${cinemaId}.json`);
    const { readFile: readFs } = await import("fs/promises");
    return await readFs(overlayPath, "utf-8");
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Write a config overlay to the database (and filesystem for local dev).
 */
async function writeOverlay(cinemaId: string, overlay: ConfigOverlay): Promise<void> {
  const dbKey = `autoscrape/overlay/${cinemaId}`;

  // Write to DB
  if (isDatabaseAvailable) {
    await db
      .insert(autoresearchConfig)
      .values({
        key: dbKey,
        value: overlay as unknown as Record<string, unknown>,
        updatedAt: new Date(),
        updatedBy: "autoscrape-run",
      })
      .onConflictDoUpdate({
        target: autoresearchConfig.key,
        set: {
          value: overlay as unknown as Record<string, unknown>,
          updatedAt: new Date(),
          updatedBy: "autoscrape-run",
        },
      });
  }

  // Also write to filesystem for local dev compatibility
  try {
    const { writeFile: writeFs, mkdir: mkdirFs } = await import("fs/promises");
    await mkdirFs(OVERLAY_DIR, { recursive: true });
    const overlayPath = join(OVERLAY_DIR, `${cinemaId}.json`);
    await writeFs(overlayPath, JSON.stringify(overlay, null, 2), "utf-8");
  } catch {
    // Filesystem write is best-effort (may fail in cloud)
  }
}

/**
 * Remove a config overlay from DB and filesystem.
 */
async function removeOverlay(cinemaId: string): Promise<void> {
  const dbKey = `autoscrape/overlay/${cinemaId}`;

  // Remove from DB
  if (isDatabaseAvailable) {
    try {
      await db
        .delete(autoresearchConfig)
        .where(eq(autoresearchConfig.key, dbKey));
    } catch (err) {
      console.warn(`[autoscrape] Failed to remove overlay from DB for ${cinemaId}:`, err);
    }
  }

  // Remove from filesystem
  try {
    const { unlink: unlinkFs } = await import("fs/promises");
    const overlayPath = join(OVERLAY_DIR, `${cinemaId}.json`);
    await unlinkFs(overlayPath);
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    // Ignore other filesystem errors in cloud
  }
}
