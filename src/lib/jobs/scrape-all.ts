/**
 * Scrape-All Orchestrator — pure-Node job module.
 *
 * Extracted out of src/trigger/scrape-all.ts so the same logic runs locally
 * (Bree scheduler, CLI, admin API) without any the cloud orchestrator dependency. The
 * trigger wrapper is now a thin shim that calls runScrapeAll().
 *
 * Fans out scrapers in 4 waves using the in-process registry:
 *   1. Chains  (3 scrapers, parallel)
 *   2. Playwright independents (7 scrapers, parallel cap 4)
 *   3. Cheerio / API independents (20 scrapers, parallel cap 4)
 *   4. Enrichment — Letterboxd ratings + post-scrape enrichment hooks
 *
 * Replaces the cloud orchestrator's `batch.triggerAndWait` with a local Promise.all-based
 * fan-out, capped at concurrency=4 per wave to avoid overwhelming the host.
 * Logs anomaly/failure/zero-count signals via summariseRunsSince and
 * dispatches a Telegram digest at the end (same shape as before).
 */

import { gte, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { scraperRuns } from "@/db/schema/admin";
import { cinemas } from "@/db/schema/cinemas";
import { screenings } from "@/db/schema/screenings";
import { sendTelegramAlert } from "@/lib/telegram";
import { stampProgress } from "@/lib/scrape-progress";
import { runScraper, isConnectionError } from "@/scrapers/runner-factory";
import {
  SCRAPER_REGISTRY,
  type ScraperRegistryEntry,
  type ScraperWave,
} from "@/scrapers/registry";

interface AnomalySummary {
  anomalies: { name: string; type: string; count: number; baseline: number | null }[];
  failures: { name: string; reason: string }[];
  zeroCounts: { name: string }[];
}

/**
 * Inspect runs from this orchestration window for anomalies, failures, and
 * zero-count returns. Zero-count without a baseline still warrants attention —
 * 66/67 cinemas had no baseline as of the 2026-04-26 audit, so anomaly
 * detection silently passed every run unless we add this fallback.
 */
async function summariseRunsSince(since: Date): Promise<AnomalySummary> {
  const runs = await db
    .select({
      cinemaName: cinemas.name,
      status: scraperRuns.status,
      anomalyType: scraperRuns.anomalyType,
      screeningCount: scraperRuns.screeningCount,
      baselineCount: scraperRuns.baselineCount,
      anomalyDetails: scraperRuns.anomalyDetails,
    })
    .from(scraperRuns)
    .innerJoin(cinemas, eq(scraperRuns.cinemaId, cinemas.id))
    .where(gte(scraperRuns.startedAt, since));

  const anomalies: AnomalySummary["anomalies"] = [];
  const failures: AnomalySummary["failures"] = [];
  const zeroCounts: AnomalySummary["zeroCounts"] = [];

  for (const r of runs) {
    if (r.status === "anomaly") {
      anomalies.push({
        name: r.cinemaName,
        type: r.anomalyType ?? "unknown",
        count: r.screeningCount ?? 0,
        baseline: r.baselineCount,
      });
    } else if (r.status === "failed") {
      failures.push({
        name: r.cinemaName,
        reason:
          (r.anomalyDetails as { errorMessage?: string } | null)?.errorMessage ?? "unknown",
      });
    } else if (r.status === "success" && (r.screeningCount ?? 0) === 0) {
      zeroCounts.push({ name: r.cinemaName });
    }
  }

  return { anomalies, failures, zeroCounts };
}

interface WaveSummary {
  label: string;
  succeeded: number;
  failed: number;
  total: number;
}

// ============================================================================
// Run-level circuit breaker (plan 001)
// ============================================================================

/**
 * Breaker threshold K: abort the run after K consecutive connection-level
 * scraper failures. Default 3; override via SCRAPE_BREAKER_THRESHOLD.
 */
const BREAKER_THRESHOLD = (() => {
  const parsed = Number(process.env.SCRAPE_BREAKER_THRESHOLD);
  // A malformed value must fall back to the default, never NaN — a NaN
  // threshold makes `consecutive >= NaN` always false, silently disabling
  // the breaker.
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 3;
})();

/**
 * Warn threshold for consecutive failures of ANY type (not just connection).
 * Deliberately does NOT abort: the fewest-screenings-first ordering
 * front-loads broken cinemas, so a burst of ordinary failures at run start
 * is expected — but a long streak (e.g. Cloudflare blocking the host IP)
 * deserves a mid-run Telegram warn instead of silence until the digest.
 * Default 6; override via SCRAPE_BREAKER_ANY_THRESHOLD.
 */
const BREAKER_ANY_WARN_THRESHOLD = (() => {
  const parsed = Number(process.env.SCRAPE_BREAKER_ANY_THRESHOLD);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 6;
})();

/** Run-scoped circuit breaker shared across all scrape waves. */
export interface RunBreaker {
  /** True once the breaker has tripped — workers stop pulling new tasks. */
  isTripped: () => boolean;
  /**
   * Record one scraper-entry outcome. Connection-level failures (see
   * isConnectionError) increment the consecutive-failure counter; any
   * success or ordinary site failure resets it to 0.
   */
  record: (source: string, outcome: { succeeded: boolean; errors?: string[] }) => void;
}

/**
 * Create a run-level circuit breaker. After 2026-06-09's 13.7h stall (a
 * wedged Supabase pooler turned four venue scrapes into futile 13.4h retry
 * loops and took the whole DB offline), K consecutive connection failures
 * trip the breaker and the remaining scrapers + enrichment are skipped.
 * Worst-case time-to-trip is bounded by the venue wall-clock caps of the
 * entries in flight (a chain-heavy first wave can take a couple of hours,
 * since each entry only records its outcome on completion) — a huge
 * improvement on 13.7h, but not literally "minutes" in every shape of run.
 *
 * NOTE: the counter is mutated cooperatively by the wave worker pool
 * (concurrency cap 4) — fine single-threaded; revisit if scraping ever
 * moves to true parallelism.
 */
export function createRunBreaker(
  threshold: number = BREAKER_THRESHOLD,
  onTrip?: (source: string, count: number, lastError: string) => void,
  anyFailureWarnThreshold: number = BREAKER_ANY_WARN_THRESHOLD,
  onAnyFailureStreak?: (source: string, count: number, lastError: string) => void,
): RunBreaker {
  let consecutive = 0;
  let tripped = false;
  // Second, softer counter: consecutive failures of ANY type. Fires the
  // one-shot warn callback and keeps going — never aborts (see
  // BREAKER_ANY_WARN_THRESHOLD for why aborting here would be wrong).
  let anyConsecutive = 0;
  let anyWarned = false;
  return {
    isTripped: () => tripped,
    record(source, outcome) {
      if (outcome.succeeded) {
        consecutive = 0;
        anyConsecutive = 0;
        return;
      }
      anyConsecutive++;
      if (!anyWarned && anyConsecutive >= anyFailureWarnThreshold) {
        anyWarned = true;
        onAnyFailureStreak?.(
          source,
          anyConsecutive,
          outcome.errors?.[0] ?? "scraper returned success=false",
        );
      }
      const connError = (outcome.errors ?? []).find((e) => isConnectionError(e));
      if (connError === undefined) {
        consecutive = 0;
        return;
      }
      consecutive++;
      if (!tripped && consecutive >= threshold) {
        tripped = true;
        onTrip?.(source, consecutive, connError);
      }
    },
  };
}

/**
 * Run an array of async tasks with a concurrency cap. Resolves once all
 * tasks settle — never rejects (errors are surfaced via task return values).
 *
 * If `shouldStop` returns true, workers stop pulling new tasks; entries that
 * never started are recorded as rejected with "circuit breaker tripped".
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
  shouldStop?: () => boolean,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      if (shouldStop?.()) return;
      const idx = cursor++;
      if (idx >= tasks.length) return;
      try {
        const value = await tasks[idx]();
        results[idx] = { status: "fulfilled", value };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);

  // Mark tasks the breaker prevented from starting.
  for (let i = 0; i < tasks.length; i++) {
    if (results[i] === undefined) {
      results[i] = { status: "rejected", reason: new Error("circuit breaker tripped") };
    }
  }
  return results;
}

/** Run a single scraper-registry entry and return wave-summary contribution. */
/**
 * Compute the breaker outcome for a completed scraper entry.
 *
 * Any write proves the DB is alive — a wedged pooler can't write — so a
 * 12-venue chain with 11 successes and one site timeout counts as
 * breaker-success, not as a consecutive connection failure. Only entries
 * that failed AND wrote nothing feed their per-venue error messages to the
 * breaker (where isConnectionError decides if they count).
 *
 * Exported for tests: this is the seam between runScraper's results and the
 * run-level circuit breaker.
 */
export function breakerOutcomeFor(result: {
  success: boolean;
  totalScreeningsAdded: number;
  totalScreeningsUpdated: number;
  venueResults: Array<{ success: boolean; error?: string }>;
}): { succeeded: boolean; errors: string[] } {
  return {
    succeeded:
      result.success ||
      result.totalScreeningsAdded + result.totalScreeningsUpdated > 0,
    errors: result.venueResults
      .filter((v) => !v.success && v.error)
      .map((v) => v.error as string),
  };
}

async function runScraperEntry(
  entry: ScraperRegistryEntry,
  waveLabel: string,
  breaker?: RunBreaker,
  onEntryComplete?: (taskId: string) => void | Promise<void>,
): Promise<{ succeeded: boolean; error?: string }> {
  const taskId = entry.taskId.replace(/^scraper-/, "");
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();
  console.log(`[scrape-all] ${waveLabel}: ${taskId} started`);
  await stampProgress({
    wave: waveLabel,
    cinemaId: taskId,
    phase: "scraper-entry-start",
    startedAt: startedAtIso,
  });
  try {
    const config = entry.buildConfig();
    const result = await runScraper(config, { useValidation: true });
    const ms = Date.now() - startedAt.getTime();
    console.log(
      `[scrape-all] ${waveLabel}: ${taskId} done ${ms}ms ${
        result.success ? "ok" : "fail"
      } (added ${result.totalScreeningsAdded}, updated ${result.totalScreeningsUpdated})`,
    );
    await stampProgress({
      wave: waveLabel,
      cinemaId: taskId,
      phase: "scraper-entry-done",
      startedAt: startedAtIso,
      durationMs: ms,
      meta: {
        ok: result.success,
        added: result.totalScreeningsAdded,
        updated: result.totalScreeningsUpdated,
      },
    });
    // Feed the circuit breaker: runScraper rarely throws (venue failures —
    // including wall-clock-cap timeouts — are folded into venueResults), so
    // connection errors must be detected from the per-venue error messages.
    breaker?.record(taskId, breakerOutcomeFor(result));
    if (result.success) {
      // Checkpoint hook for --resume; a failed hook must not fail the entry.
      try {
        await onEntryComplete?.(taskId);
      } catch (err) {
        console.warn(`[scrape-all] onEntryComplete(${taskId}) failed:`, err);
      }
    }
    return { succeeded: result.success };
  } catch (err) {
    const ms = Date.now() - startedAt.getTime();
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[scrape-all] ${waveLabel}: ${taskId} threw after ${ms}ms: ${message}`);
    await stampProgress({
      wave: waveLabel,
      cinemaId: taskId,
      phase: "scraper-entry-error",
      startedAt: startedAtIso,
      durationMs: ms,
      error: message,
    });
    breaker?.record(taskId, { succeeded: false, errors: [message] });
    return { succeeded: false, error: message };
  }
}

/**
 * Map of cinema_id → last successful scrape timestamp. Cinemas that have never
 * been scraped successfully are absent from the map.
 */
type FreshnessMap = Map<string, Date>;

/** Load each cinema's most recent successful scrape timestamp from scraper_runs. */
async function loadFreshnessMap(): Promise<FreshnessMap> {
  const rows = await db
    .select({
      cinemaId: scraperRuns.cinemaId,
      lastScrape: sql<Date>`MAX(${scraperRuns.completedAt})`.as("lastScrape"),
    })
    .from(scraperRuns)
    .where(eq(scraperRuns.status, "success"))
    .groupBy(scraperRuns.cinemaId);

  const map: FreshnessMap = new Map();
  for (const r of rows) {
    if (r.lastScrape) map.set(r.cinemaId, new Date(r.lastScrape));
  }
  return map;
}

/**
 * Map of cinema_id → count of upcoming screenings. Used as the PRIMARY sort
 * key within a wave so cinemas with low coverage (likely scraper failures)
 * are scraped first. Cinemas absent from the map have 0 screenings.
 */
type ScreeningCountMap = Map<string, number>;

/** Load each cinema's count of upcoming (future) screenings. */
async function loadScreeningCountMap(): Promise<ScreeningCountMap> {
  const rows = await db
    .select({
      cinemaId: screenings.cinemaId,
      count: sql<number>`COUNT(*)::int`.as("count"),
    })
    .from(screenings)
    .where(gte(screenings.datetime, new Date()))
    .groupBy(screenings.cinemaId);

  const map: ScreeningCountMap = new Map();
  for (const r of rows) {
    map.set(r.cinemaId, r.count);
  }
  return map;
}

/** Extract every cinema_id a registry entry will scrape. */
function getEntryCinemaIds(entry: ScraperRegistryEntry): string[] {
  const config = entry.buildConfig();
  if (config.type === "single") return [config.venue.id];
  return config.venues.map((v) => v.id);
}

/**
 * Staleness key for sorting: the OLDEST last-scrape across the entry's venues.
 * Returns 0 (epoch) for entries with any never-scraped venue, so they sort first.
 */
function entryStaleness(entry: ScraperRegistryEntry, freshness: FreshnessMap): number {
  const ids = getEntryCinemaIds(entry);
  let oldest = Number.POSITIVE_INFINITY;
  for (const id of ids) {
    const last = freshness.get(id);
    if (!last) return 0; // never-scraped venue → top priority
    if (last.getTime() < oldest) oldest = last.getTime();
  }
  return oldest === Number.POSITIVE_INFINITY ? 0 : oldest;
}

/**
 * Screening-count key for sorting: the LOWEST upcoming-screening count across
 * the entry's venues. A multi-venue chain with one starved venue sorts first
 * — that venue is most likely broken. Missing venues are treated as 0.
 */
function entryScreeningCount(
  entry: ScraperRegistryEntry,
  countMap: ScreeningCountMap,
): number {
  const ids = getEntryCinemaIds(entry);
  let lowest = Number.POSITIVE_INFINITY;
  for (const id of ids) {
    const n = countMap.get(id) ?? 0;
    if (n < lowest) lowest = n;
  }
  return lowest === Number.POSITIVE_INFINITY ? 0 : lowest;
}

/** Human-readable digest labels per registry wave. */
const WAVE_LABELS: Record<ScraperWave, string> = {
  chain: "Chains",
  playwright: "Playwright",
  cheerio: "Cheerio",
  enrichment: "Enrichment",
};

/**
 * Fan-out scrapers from one or more waves through a SINGLE shared concurrency
 * pool. Passing multiple waves removes the barrier between them: with
 * separate waves, one slow Playwright straggler held all 20 Cheerio scrapers
 * hostage; a shared pool keeps the total concurrency cap identical while
 * letting fast entries flow. Returns one WaveSummary per input wave so the
 * Telegram digest shape is unchanged.
 */
async function runWaves(
  waves: ScraperWave[],
  poolLabel: string,
  concurrency: number,
  freshness: FreshnessMap,
  countMap: ScreeningCountMap,
  breaker: RunBreaker,
  options: ScrapeAllOptions = {},
): Promise<WaveSummary[]> {
  const byWave = (w: ScraperWave) => SCRAPER_REGISTRY.filter((e) => e.wave === w);
  if (breaker.isTripped()) {
    return waves.map((w) => {
      const count = byWave(w).length;
      console.log(
        `[scrape-all] ${WAVE_LABELS[w]}: skipped (circuit breaker tripped) — ${count} scrapers`,
      );
      return { label: WAVE_LABELS[w], succeeded: 0, failed: count, total: count };
    });
  }
  // Resume support: entries that already succeeded in the checkpointed run
  // are counted as pre-succeeded (so digest math stays honest) and not re-run.
  const skipSet = new Set(options.skipTaskIds ?? []);
  const allEntries = waves.flatMap(byWave);
  const resumeSkipped = allEntries.filter((e) => skipSet.has(e.taskId.replace(/^scraper-/, "")));
  if (resumeSkipped.length > 0) {
    console.log(
      `[scrape-all] ${poolLabel}: skipped (resume) — ` +
        resumeSkipped.map((e) => e.taskId.replace(/^scraper-/, "")).join(", "),
    );
  }
  // Sort by screening count ASC (fewest first — broken scrapers surface fast),
  // staleness ASC as tiebreaker (preserve rotation when counts are equal).
  // Compute both keys once per entry; sort + log share the results. The sort
  // spans ALL waves in the pool, so a starved Cheerio venue outranks a
  // healthy Playwright one.
  const ranked = allEntries
    .filter((e) => !skipSet.has(e.taskId.replace(/^scraper-/, "")))
    .map((entry) => ({
      entry,
      count: entryScreeningCount(entry, countMap),
      ms: entryStaleness(entry, freshness),
    }))
    .sort((a, b) => a.count - b.count || a.ms - b.ms);
  if (ranked.length > 0) {
    const orderStr = ranked
      .map(({ entry, count, ms }) => {
        const age = ms === 0 ? "never" : `${Math.floor((Date.now() - ms) / 86_400_000)}d`;
        return `${entry.taskId.replace(/^scraper-/, "")}(${count}scr, ${age})`;
      })
      .join(", ");
    console.log(`[scrape-all] ${poolLabel} order (fewest screenings, then stalest): ${orderStr}`);
  }
  const entries = ranked.map((r) => r.entry);
  const tasks = entries.map(
    (entry) => () =>
      runScraperEntry(entry, WAVE_LABELS[entry.wave], breaker, options.onEntryComplete),
  );
  const settled = await runWithConcurrency(tasks, concurrency, breaker.isTripped);

  // Tally per wave so the digest keeps one row per wave.
  const tally = new Map<ScraperWave, { succeeded: number; failed: number }>(
    waves.map((w) => [w, { succeeded: 0, failed: 0 }]),
  );
  for (const e of resumeSkipped) {
    tally.get(e.wave)!.succeeded++;
  }
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const { taskId, wave } = entries[i];
    if (result.status === "fulfilled" && result.value.succeeded) {
      tally.get(wave)!.succeeded++;
    } else {
      tally.get(wave)!.failed++;
      const reason =
        result.status === "rejected"
          ? result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
          : (result.value.error ?? "scraper returned success=false");
      console.log(`[scrape-all] ${WAVE_LABELS[wave]} FAILED: ${taskId} — ${reason}`);
    }
  }

  return waves.map((w) => {
    const { succeeded, failed } = tally.get(w)!;
    console.log(`[scrape-all] ${WAVE_LABELS[w]}: ${succeeded} succeeded, ${failed} failed`);
    return { label: WAVE_LABELS[w], succeeded, failed, total: byWave(w).length };
  });
}

/** Run the enrichment wave: Letterboxd ratings + (best-effort) other tasks. */
async function runEnrichmentWave(): Promise<WaveSummary> {
  let succeeded = 0;
  let failed = 0;
  const total = 1; // enrichment-letterboxd

  try {
    const { enrichLetterboxdRatings } = await import("@/db/enrich-letterboxd");
    await enrichLetterboxdRatings(100, true);
    succeeded++;
  } catch (err) {
    failed++;
    console.log(
      `[scrape-all] Enrichment FAILED: enrichment-letterboxd — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  console.log(`[scrape-all] Enrichment: ${succeeded} succeeded, ${failed} failed`);
  return { label: "Enrichment", succeeded, failed, total };
}

export interface ScrapeAllResult {
  durationMin: number;
  totalSucceeded: number;
  totalFailed: number;
  waves: WaveSummary[];
  anomalies: number;
  failures: number;
  zeroCounts: number;
}

export interface ScrapeAllOptions {
  /** Normalized taskIds (no `scraper-` prefix) to skip — used by --resume to
   * avoid re-running scrapers that already succeeded in a crashed run. */
  skipTaskIds?: string[];
  /** Invoked after each scraper entry succeeds (normalized taskId) — used by
   * the checkpoint writer. Errors are caught and logged, never propagated. */
  onEntryComplete?: (taskId: string) => void | Promise<void>;
}

/**
 * Pure-Node entry point for the daily scrape orchestrator.
 *
 * Runs the four waves sequentially (each wave parallelises internally up to
 * the concurrency cap), then records a Telegram digest covering anomalies,
 * failures, and zero-count baselines for the run window.
 */
export async function runScrapeAll(options: ScrapeAllOptions = {}): Promise<ScrapeAllResult> {
  const startTime = Date.now();
  const startedAt = new Date(startTime);
  const waveSummaries: WaveSummary[] = [];

  // Run-level circuit breaker: K consecutive connection failures abort the
  // run in minutes instead of cascading into a multi-hour DB outage.
  const breaker = createRunBreaker(
    BREAKER_THRESHOLD,
    (source, count, lastError) => {
      console.error(
        `[scrape-all] CIRCUIT BREAKER TRIPPED after ${count} consecutive connection failures ` +
          `(last failing cinema: ${source} — ${lastError}). Skipping remaining scrapers.`,
      );
      void sendTelegramAlert({
        title: "Scrape circuit breaker tripped",
        message:
          `${count} consecutive connection-level failures — aborting the run.\n` +
          `Last failing cinema: ${source}\n${lastError}`,
        level: "error",
      }).catch(() => {});
    },
    BREAKER_ANY_WARN_THRESHOLD,
    (source, count, lastError) => {
      // One-shot mid-run heads-up; the run continues (see threshold docs).
      console.warn(
        `[scrape-all] ${count} consecutive scraper failures of any type ` +
          `(latest: ${source} — ${lastError}). Possible systemic issue; run continues.`,
      );
      void sendTelegramAlert({
        title: "Scrape failure streak",
        message:
          `${count} consecutive scraper failures (any type) — possible systemic issue ` +
          `(WAF/IP block, site-wide outage). Run continues.\n` +
          `Latest failing cinema: ${source}\n${lastError}`,
        level: "warn",
      }).catch(() => {});
    },
  );

  // Load sort signals once, up front. Within each wave, entries are sorted
  // fewest-screenings first (broken scrapers surface fast) with staleness as
  // a tiebreaker (preserves the rotation behaviour from commit 712ee16).
  const [freshness, countMap] = await Promise.all([
    loadFreshnessMap(),
    loadScreeningCountMap(),
  ]);

  // Wave 1: Chain scrapers (3 — fully parallel). Kept as their own pool:
  // chains are multi-venue giants with scaled wall-clock caps.
  waveSummaries.push(
    ...(await runWaves(["chain"], "Chains", 4, freshness, countMap, breaker, options)),
  );

  // Waves 2+3: Playwright (7) + Cheerio/API (20) independents share ONE pool
  // (cap 4 — same ceiling as the old per-wave caps, so memory headroom is
  // unchanged). Previously the wave barrier let one slow Playwright straggler
  // block all 20 Cheerio scrapers; the shared pool removes that dead time.
  waveSummaries.push(
    ...(await runWaves(
      ["playwright", "cheerio"],
      "Independents (Playwright + Cheerio)",
      4,
      freshness,
      countMap,
      breaker,
      options,
    )),
  );

  // Wave 4: Post-scrape enrichment (Letterboxd ratings). Skipped when the
  // breaker tripped — enrichment would only hammer the same wedged DB.
  if (breaker.isTripped()) {
    console.log("[scrape-all] Enrichment: skipped (circuit breaker tripped)");
    waveSummaries.push({ label: "Enrichment", succeeded: 0, failed: 1, total: 1 });
  } else {
    waveSummaries.push(await runEnrichmentWave());
  }

  const totalSucceeded = waveSummaries.reduce((s, w) => s + w.succeeded, 0);
  const totalFailed = waveSummaries.reduce((s, w) => s + w.failed, 0);
  const durationMin = Math.round((Date.now() - startTime) / 60_000);

  const summaryLines = waveSummaries.map(
    (w) => `${w.label}: ${w.succeeded}/${w.total} OK${w.failed > 0 ? ` (${w.failed} failed)` : ""}`,
  );

  // Pull anomaly/failure/zero-count signal from this run window
  const anomalyReport = await summariseRunsSince(startedAt).catch((err) => {
    console.warn("[scrape-all] summariseRunsSince failed:", err);
    return { anomalies: [], failures: [], zeroCounts: [] } as AnomalySummary;
  });

  const totalSignals =
    anomalyReport.anomalies.length +
    anomalyReport.failures.length +
    anomalyReport.zeroCounts.length;

  const messageParts = [
    `Duration: ${durationMin}min`,
    summaryLines.join("\n"),
    `Total: ${totalSucceeded} succeeded, ${totalFailed} failed`,
  ];

  if (anomalyReport.anomalies.length > 0) {
    messageParts.push(
      `\nAnomalies (${anomalyReport.anomalies.length}):\n` +
        anomalyReport.anomalies
          .map((a) => `• ${a.name}: ${a.type} (${a.count} vs baseline ${a.baseline ?? "?"})`)
          .join("\n"),
    );
  }
  if (anomalyReport.failures.length > 0) {
    messageParts.push(
      `\nFailures (${anomalyReport.failures.length}):\n` +
        anomalyReport.failures.map((f) => `• ${f.name}: ${f.reason}`).join("\n"),
    );
  }
  if (anomalyReport.zeroCounts.length > 0) {
    messageParts.push(
      `\nZero-count (no baseline) (${anomalyReport.zeroCounts.length}):\n` +
        anomalyReport.zeroCounts.map((z) => `• ${z.name}`).join("\n"),
    );
  }

  const level: "info" | "warn" | "error" =
    totalFailed > 0 || anomalyReport.failures.length > 0
      ? "error"
      : totalSignals > 0
        ? "warn"
        : "info";

  await sendTelegramAlert({
    title: "Daily Scrape Complete",
    message: messageParts.join("\n"),
    level,
  });

  return {
    durationMin,
    totalSucceeded,
    totalFailed,
    waves: waveSummaries,
    anomalies: anomalyReport.anomalies.length,
    failures: anomalyReport.failures.length,
    zeroCounts: anomalyReport.zeroCounts.length,
  };
}
