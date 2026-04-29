/**
 * AutoScrape Repair — pure-Node job module.
 *
 * Phase 6 of the local-scraping rebuild: replaces the deleted Trigger.dev
 * `autoresearch/autoscrape` harness with a Stagehand-driven self-healing pass
 * that runs inside the Bree scheduler.
 *
 * Behaviour:
 *   1. Find cinemas whose most recent scraper_runs row in the last 48h is
 *      `anomaly` OR (`success` AND `screening_count = 0`). Cap at 5 to bound
 *      cost.
 *   2. For each, navigate to the cinema's `website` URL with Stagehand v3
 *      (DeepSeek-V4-Pro via the OpenAI-compatible AI SDK provider) and call
 *      `extract()` with a screenings schema.
 *   3. If extracted >= 50% of the cinema's recent baseline, mark recovered and
 *      send a Telegram report with sample screenings (DO NOT persist — humans
 *      review and trigger the canonical scraper).
 *   4. Otherwise capture a screenshot and send a failure Telegram alert.
 *   5. Sequential — one Stagehand instance reused across cinemas.
 *
 * Kill-switch:
 *   - DEEPSEEK_API_KEY missing OR AUTOSCRAPE_DISABLED=1 → returns []
 *     immediately, no API calls, no browser launch.
 *
 * NB: This module never writes to `screenings` / `films` / `scraper_runs`.
 * Self-healing without auto-persist is the v1 contract.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { Stagehand, AISdkClient } from "@browserbasehq/stagehand";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { db } from "@/db";
import { scraperRuns, cinemaBaselines } from "@/db/schema/admin";
import { cinemas } from "@/db/schema/cinemas";
import { sendTelegramAlert } from "@/lib/telegram";

export interface AutoscrapeRepairResult {
  cinemaId: string;
  cinemaName: string;
  attempted: boolean;
  recovered: boolean;
  screeningsExtracted: number;
  durationMs: number;
  error?: string;
  notes?: string;
}

interface ProblemCinema {
  cinemaId: string;
  cinemaName: string;
  website: string;
  lastStatus: "anomaly" | "success";
  lastScreeningCount: number;
  baselineWeekday: number | null;
  baselineWeekend: number | null;
}

const MAX_CINEMAS_PER_RUN = 5;
const PROBLEM_LOOKBACK_HOURS = 48;
const RECOVERY_THRESHOLD_RATIO = 0.5;
const SAMPLE_SCREENING_COUNT = 5;
const NAV_TIMEOUT_MS = 45_000;

/** Zod schema for the screenings list returned by Stagehand's extract(). */
const ScreeningSchema = z.object({
  title: z.string(),
  datetime: z.string(),
  bookingUrl: z.string().optional(),
});

const ExtractionSchema = z.object({
  screenings: z.array(ScreeningSchema),
});

type ExtractedScreening = z.infer<typeof ScreeningSchema>;

/** Kill-switch — returns true if we should skip this run entirely. */
function isDisabled(): boolean {
  if (!process.env.DEEPSEEK_API_KEY) return true;
  if (process.env.AUTOSCRAPE_DISABLED === "1") return true;
  return false;
}

/**
 * Find cinemas in trouble: most-recent scraper_runs row in the last
 * PROBLEM_LOOKBACK_HOURS is `anomaly` OR (`success` with zero screenings).
 *
 * Uses a window-function CTE to pull only the latest run per cinema. Capped
 * at MAX_CINEMAS_PER_RUN to bound DeepSeek + browser cost.
 */
async function findProblemCinemas(): Promise<ProblemCinema[]> {
  const since = new Date(Date.now() - PROBLEM_LOOKBACK_HOURS * 60 * 60 * 1000);

  // Latest run per cinema in the window — ROW_NUMBER() partitioned by cinema.
  const rows = await db.execute(sql`
    WITH latest AS (
      SELECT
        ${scraperRuns.cinemaId}      AS cinema_id,
        ${scraperRuns.status}        AS status,
        ${scraperRuns.screeningCount} AS screening_count,
        ROW_NUMBER() OVER (
          PARTITION BY ${scraperRuns.cinemaId}
          ORDER BY ${scraperRuns.startedAt} DESC
        ) AS rn
      FROM ${scraperRuns}
      WHERE ${scraperRuns.startedAt} >= ${since.toISOString()}
    )
    SELECT
      l.cinema_id        AS "cinemaId",
      l.status           AS "status",
      l.screening_count  AS "screeningCount",
      ${cinemas.name}    AS "cinemaName",
      ${cinemas.website} AS "website",
      ${cinemaBaselines.weekdayAvg} AS "weekdayAvg",
      ${cinemaBaselines.weekendAvg} AS "weekendAvg"
    FROM latest l
    INNER JOIN ${cinemas} ON ${cinemas.id} = l.cinema_id
    LEFT JOIN ${cinemaBaselines} ON ${cinemaBaselines.cinemaId} = l.cinema_id
    WHERE l.rn = 1
      AND (
        l.status = 'anomaly'
        OR (l.status = 'success' AND COALESCE(l.screening_count, 0) = 0)
      )
    ORDER BY l.cinema_id ASC
    LIMIT ${MAX_CINEMAS_PER_RUN}
  `);

  // Drizzle's `db.execute` returns the postgres-js array shape at runtime.
  const records = rows as unknown as Array<{
    cinemaId: string;
    status: "anomaly" | "success";
    screeningCount: number | null;
    cinemaName: string;
    website: string;
    weekdayAvg: number | null;
    weekendAvg: number | null;
  }>;

  return records.map((r) => ({
    cinemaId: r.cinemaId,
    cinemaName: r.cinemaName,
    website: r.website,
    lastStatus: r.status,
    lastScreeningCount: r.screeningCount ?? 0,
    baselineWeekday: r.weekdayAvg,
    baselineWeekend: r.weekendAvg,
  }));
}

/** Pick the relevant baseline for "today" — weekend vs weekday. */
function pickBaseline(c: ProblemCinema): number | null {
  const day = new Date().getUTCDay(); // 0 = Sun, 6 = Sat
  const isWeekend = day === 0 || day === 6;
  return isWeekend ? c.baselineWeekend : c.baselineWeekday;
}

/**
 * Build the Stagehand instance with the DeepSeek-V4-Pro model wired through
 * the AI SDK's OpenAI-compatible provider. Stagehand v3 expects an LLMClient
 * — we use its bundled `AISdkClient` adapter and pass the LanguageModelV2
 * returned by `createOpenAICompatible(...).chatModel(...)`.
 */
function buildStagehand(): Stagehand {
  const deepseek = createOpenAICompatible({
    name: "deepseek",
    apiKey: process.env.DEEPSEEK_API_KEY!,
    baseURL: "https://api.deepseek.com",
  });

  const llmClient = new AISdkClient({
    model: deepseek.chatModel("deepseek-v4-pro"),
  });

  return new Stagehand({
    env: "LOCAL",
    llmClient,
    localBrowserLaunchOptions: { headless: true },
    verbose: 0,
  });
}

/**
 * Attempt extraction on a single cinema. Returns the per-cinema result row.
 * Never throws — all failures are captured into `error` for the caller.
 */
async function attemptCinema(
  stagehand: Stagehand,
  cinema: ProblemCinema,
): Promise<AutoscrapeRepairResult> {
  const start = Date.now();
  const baseline = pickBaseline(cinema);

  try {
    // Stagehand v3 exposes top-level pages via V3Context.pages() / activePage().
    // After init() the context already has a default top-level page; use that.
    const page =
      stagehand.context.activePage() ??
      (await stagehand.context.newPage(cinema.website));
    if (page.url() !== cinema.website) {
      await page.goto(cinema.website, {
        waitUntil: "domcontentloaded",
        timeoutMs: NAV_TIMEOUT_MS,
      });
    }

    // Stagehand's extract() has overloads for (instruction) -> defaultExtractSchema
    // and (instruction, schema) -> schema-inferred. TypeScript picks the wrong
    // overload here because our Zod 4 ZodObject doesn't narrow `T extends
    // StagehandZodSchema` cleanly; cast the result to the schema's inferred
    // shape so downstream code stays typed.
    const extracted = (await stagehand.extract(
      "Extract every film screening listed on this page. For each screening, " +
        "capture the film title, the date+time of the screening combined into " +
        "ISO 8601, and the booking URL if present.",
      ExtractionSchema,
    )) as z.infer<typeof ExtractionSchema>;

    const screenings: ExtractedScreening[] = Array.isArray(extracted?.screenings)
      ? extracted.screenings
      : [];

    const recovered =
      baseline != null && screenings.length >= Math.ceil(baseline * RECOVERY_THRESHOLD_RATIO);

    if (recovered) {
      const sample = screenings
        .slice(0, SAMPLE_SCREENING_COUNT)
        .map((s, i) => `  ${i + 1}. ${s.title} — ${s.datetime}`)
        .join("\n");
      await sendTelegramAlert({
        title: `AutoScrape repair RECOVERED: ${cinema.cinemaName}`,
        message:
          `Cinema: ${cinema.cinemaName} (${cinema.cinemaId})\n` +
          `Last canonical run: ${cinema.lastStatus} with ${cinema.lastScreeningCount} screenings\n` +
          `Stagehand extracted: ${screenings.length} (baseline ${baseline ?? "?"})\n` +
          `Method: Stagehand v3 + DeepSeek-V4-Pro extract() on ${cinema.website}\n\n` +
          `Sample:\n${sample || "  (none)"}\n\n` +
          `Action: review and re-run the canonical scraper. NOT auto-persisted.`,
        level: "warn",
      }).catch(() => undefined);
    } else {
      // Capture a screenshot to the alert. Telegram doesn't accept binary in
      // sendMessage — we just note that the screenshot exists and let humans
      // pull from logs if needed. (Future: upload to Supabase Storage.)
      let screenshotNote = "screenshot unavailable";
      try {
        const buf = await page.screenshot({ fullPage: false });
        screenshotNote = `screenshot captured (${buf.byteLength} bytes)`;
      } catch {
        // ignore
      }
      await sendTelegramAlert({
        title: `AutoScrape repair FAILED: ${cinema.cinemaName}`,
        message:
          `Cinema: ${cinema.cinemaName} (${cinema.cinemaId})\n` +
          `Last canonical run: ${cinema.lastStatus} with ${cinema.lastScreeningCount} screenings\n` +
          `Stagehand extracted: ${screenings.length} (baseline ${baseline ?? "?"} — threshold ` +
          `${baseline ? Math.ceil(baseline * RECOVERY_THRESHOLD_RATIO) : "?"})\n` +
          `URL: ${cinema.website}\n` +
          `Diagnostic: ${screenshotNote}`,
        level: "error",
      }).catch(() => undefined);
    }

    return {
      cinemaId: cinema.cinemaId,
      cinemaName: cinema.cinemaName,
      attempted: true,
      recovered,
      screeningsExtracted: screenings.length,
      durationMs: Date.now() - start,
      notes: recovered
        ? `Recovered via Stagehand extract on ${cinema.website}`
        : `Below ${Math.round(RECOVERY_THRESHOLD_RATIO * 100)}% baseline threshold`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      cinemaId: cinema.cinemaId,
      cinemaName: cinema.cinemaName,
      attempted: true,
      recovered: false,
      screeningsExtracted: 0,
      durationMs: Date.now() - start,
      error: message,
    };
  }
}

/**
 * Public entry point. Returns one result row per cinema attempted (empty
 * array if the kill-switch fires or no problem cinemas exist).
 *
 * Sequential by design — Stagehand owns its own Chromium and running multiple
 * instances concurrently is heavy. We share one Stagehand across all cinemas
 * in this invocation.
 */
export async function runAutoscrapeRepair(): Promise<AutoscrapeRepairResult[]> {
  if (isDisabled()) {
    console.log(
      "[autoscrape-repair] Disabled (DEEPSEEK_API_KEY missing or AUTOSCRAPE_DISABLED=1) — skipping",
    );
    return [];
  }

  const problems = await findProblemCinemas();
  if (problems.length === 0) {
    console.log("[autoscrape-repair] No problem cinemas in last 48h — nothing to do");
    return [];
  }

  console.log(
    `[autoscrape-repair] ${problems.length} problem cinemas:\n  ` +
      problems.map((p) => `${p.cinemaName} (${p.lastStatus}, ${p.lastScreeningCount})`).join("\n  "),
  );

  const stagehand = buildStagehand();
  const results: AutoscrapeRepairResult[] = [];

  try {
    await stagehand.init();

    for (const cinema of problems) {
      console.log(`[autoscrape-repair] Attempting ${cinema.cinemaName} → ${cinema.website}`);
      const result = await attemptCinema(stagehand, cinema);
      results.push(result);
      console.log(
        `[autoscrape-repair] ${cinema.cinemaName}: ${
          result.recovered ? "RECOVERED" : "failed"
        } (${result.screeningsExtracted} screenings in ${result.durationMs}ms)` +
          (result.error ? ` — ${result.error}` : ""),
      );
    }
  } finally {
    await stagehand.close().catch(() => undefined);
  }

  const recovered = results.filter((r) => r.recovered).length;
  console.log(
    `[autoscrape-repair] Done — ${recovered}/${results.length} recovered`,
  );

  return results;
}

// Avoid unused-import lint warnings on helpers we keep around for clarity.
void and;
void desc;
void eq;
void gte;
