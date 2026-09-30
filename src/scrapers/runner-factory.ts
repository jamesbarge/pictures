/**
 * Scraper Runner Factory
 *
 * Unified runner for all cinema scrapers with:
 * - Structured JSON logging for production
 * - Retry-then-continue error handling
 * - Support for single-venue, multi-venue, and chain scrapers
 * - Consistent health checks and pipeline processing
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { CinemaScraper, ChainScraper, RawScreening } from "./types";
import { processScreenings, saveScreenings, ensureCinemaExists } from "./pipeline";
import {
  asPreFilterSource,
  buildAccounting,
  reportAccounting,
  type ScreeningAccounting,
} from "./utils/screening-accounting-report";
import { db, isDatabaseAvailable } from "../db";
import { scraperRuns, cinemaBaselines } from "../db/schema/admin";
import { eq } from "drizzle-orm";

// ============================================================================
// Types
// ============================================================================

export interface VenueDefinition {
  id: string;
  name: string;
  shortName: string;
  website?: string;
  chain?: string;
  address?: {
    street?: string;
    area: string;
    postcode?: string;
  };
  features?: string[];
}

export interface SingleVenueConfig {
  type: "single";
  venue: VenueDefinition;
  createScraper: () => CinemaScraper;
}

export interface MultiVenueConfig {
  type: "multi";
  /** Array of venues to scrape (e.g., BFI Southbank + BFI IMAX) */
  venues: VenueDefinition[];
  /** Factory that creates a scraper for a specific venue ID */
  createScraper: (venueId: string) => CinemaScraper;
}

export interface ChainConfig {
  type: "chain";
  chainName: string;
  /** All venues in the chain */
  venues: VenueDefinition[];
  /** Factory that creates the chain scraper */
  createScraper: () => ChainScraper;
  /** Get active venue IDs (optional, defaults to all) */
  getActiveVenueIds?: () => string[];
}

export type ScraperRunnerConfig = SingleVenueConfig | MultiVenueConfig | ChainConfig;

export interface RunnerOptions {
  /** Number of retry attempts per venue (default: 3) */
  retryAttempts?: number;
  /** Whether to continue on error (default: true - retry-then-continue) */
  continueOnError?: boolean;
  /** Use processScreenings with validation instead of saveScreenings (default: true) */
  useValidation?: boolean;
  /** Specific venue IDs to scrape (for chains/multi-venue, overrides getActiveVenueIds) */
  venueIds?: string[];
  /** Enable verbose logging (default: false) */
  verbose?: boolean;
}

interface VenueResult {
  venueId: string;
  venueName: string;
  success: boolean;
  screeningsFound: number;
  screeningsAdded: number;
  screeningsUpdated: number;
  screeningsFailed: number;
  /**
   * Screenings that persisted but whose follow-up work failed (today: festival
   * linking). Never folded into `screeningsFailed`: the rows are in the table,
   * so counting them as failed writes would overstate loss and would suppress
   * the superseded report for the wrong reason. Carried here so a festival
   * failure cannot read as a clean venue.
   */
  screeningsPostWriteFailures: number;
  durationMs: number;
  error?: string;
  retryCount: number;
  /**
   * Stage-by-stage screening accounting for this venue, when the seams could
   * establish it. Absent means not measured, never "no loss".
   */
  accounting?: ScreeningAccounting;
  /**
   * Reason the observability diff failed open, when it did
   * (PipelineResult.diffFailed). The venue is still `success: true` and still
   * wrote its rows — this is a degradation marker, not a failure, and must
   * never cause a retry.
   *
   * Carried out of the runner because it is the only remaining channel for one
   * specific infrastructure signal: the diff's two lookups are the run's
   * pool-starvation canary (0.6-1.1s measured against a 15s withDbTimeout
   * ceiling), and before the diff failed open their expiry surfaced as a failed
   * venue whose `error` contained "(client-side)", which fed the run-level
   * circuit breaker. See breakerOutcomeFor in src/lib/jobs/scrape-all.ts.
   */
  diffFailed?: string;
}

export interface RunnerResult {
  success: boolean;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  venueResults: VenueResult[];
  totalScreeningsFound: number;
  totalScreeningsAdded: number;
  totalScreeningsUpdated: number;
  totalVenuesSucceeded: number;
  totalVenuesFailed: number;
}

// ============================================================================
// Structured Logging
// ============================================================================

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  event: string;
  data?: Record<string, unknown>;
}

function log(entry: Omit<LogEntry, "timestamp">): void {
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  // In production (Vercel), output JSON for log aggregation
  // In development, use human-readable format
  if (process.env.NODE_ENV === "production" || process.env.LOG_FORMAT === "json") {
    console.log(JSON.stringify(logEntry));
  } else {
    const prefix = {
      info: "ℹ️ ",
      warn: "⚠️ ",
      error: "❌",
      debug: "🔍",
    }[entry.level];

    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
    console.log(`${prefix} [${entry.event}]${dataStr}`);
  }
}

// ============================================================================
// Run Recording (fire-and-forget with per-call flush)
// ============================================================================

/**
 * Per-`runScraper`-call array of pending `recordScraperRun` promises.
 *
 * Was previously a module-level array shared across every concurrent
 * `runScraper` call in the process. With waves running 4 scrapers in
 * parallel and `flushPendingRecords` doing `splice(0)` to drain, two
 * flushes overlapping could swallow each other's pending writes. Each
 * `runScraper` invocation now enters its own `AsyncLocalStorage` context
 * with its own array — fire-and-forget pushes go to the active call's
 * list, the flush at the end of `runScraper` drains exactly that list.
 */
const pendingRecordsContext = new AsyncLocalStorage<Promise<void>[]>();

/** Push a fire-and-forget recordScraperRun into the current `runScraper` context. */
function pushPendingRecord(promise: Promise<void>): void {
  const list = pendingRecordsContext.getStore();
  if (list) {
    list.push(promise);
    return;
  }
  // Caller is outside any runScraper context — invariant violation. Log it
  // (so the next regression of the wiring is observable) and detach from the
  // await chain so an unhandled rejection can't crash the process.
  console.warn(
    "[runner-factory] recordScraperRun pushed outside runScraper context — fire-and-forget without flush",
  );
  promise.catch(() => {});
}

/** Await all pending records in the current `runScraper` context (with 5s ceiling). */
async function flushPendingRecords(): Promise<void> {
  const list = pendingRecordsContext.getStore();
  if (!list || list.length === 0) return;
  const pending = list.splice(0);
  await Promise.race([
    Promise.allSettled(pending),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}

/**
 * Get baseline screening count for a cinema (weekend vs weekday).
 * Returns null if no baseline exists or on error.
 */
async function getBaseline(cinemaId: string): Promise<{ count: number; tolerance: number } | null> {
  try {
    if (!isDatabaseAvailable) return null;
    const [baseline] = await db
      .select()
      .from(cinemaBaselines)
      .where(eq(cinemaBaselines.cinemaId, cinemaId))
      .limit(1);

    if (!baseline) return null;

    const day = new Date().getDay();
    const isWeekend = day === 0 || day === 6;
    const count = isWeekend ? baseline.weekendAvg : baseline.weekdayAvg;

    if (count == null) return null;
    return { count, tolerance: baseline.tolerancePercent };
  } catch {
    return null;
  }
}

/**
 * Record a scraper run to the database for tracking and anomaly detection.
 * Fire-and-forget: errors are logged but never thrown.
 */
/** Detect if a screening count deviates from the baseline beyond the tolerance threshold. */
function detectAnomaly(
  baseline: { count: number; tolerance: number },
  screeningCount: number
): { type: "low_count" | "zero_results" | "high_count"; details: { expectedRange: { min: number; max: number }; percentChange: number } } | null {
  const deviation = baseline.count > 0
    ? (Math.abs(screeningCount - baseline.count) / baseline.count) * 100
    : 0;

  if (deviation <= baseline.tolerance) return null;

  return {
    type: screeningCount === 0
      ? "zero_results"
      : screeningCount < baseline.count
        ? "low_count"
        : "high_count",
    details: {
      expectedRange: {
        min: Math.round(baseline.count * (1 - baseline.tolerance / 100)),
        max: Math.round(baseline.count * (1 + baseline.tolerance / 100)),
      },
      percentChange: Math.round(deviation),
    },
  };
}

/**
 * Classify a run's error string into the failure taxonomy stored in
 * `scraper_runs.metadata.failureKind`.
 *
 * The two specific kinds have unique markers, so the order below matters:
 *   - "(client-side)" is only ever appended by withDbTimeout (src/db/index.ts),
 *     i.e. infrastructure — the scrape may well have worked.
 *   - "Health check failed" is only ever the precheck gate.
 * Everything else is the scraper or the venue's site: "scrape".
 *
 * Exported for tests and for anything reading run history back.
 */
export function classifyFailureKind(
  error: string | undefined,
): "precheck" | "db-timeout" | "scrape" | undefined {
  if (!error) return undefined;
  if (error.includes("(client-side)")) return "db-timeout";
  if (error.includes("Health check failed")) return "precheck";
  return "scrape";
}

async function recordScraperRun(params: {
  cinemaId: string;
  startedAt: Date;
  status: "success" | "failed" | "anomaly" | "partial";
  screeningCount: number;
  durationMs: number;
  error?: string;
  /** Screening writes that failed or were dropped (pipeline `failed`). */
  failedWrites?: number;
  /**
   * Screenings that persisted but whose follow-up work failed (pipeline
   * `postWriteFailures`). Recorded separately from `failedWrites` because the
   * rows landed; it still downgrades the run, since before the accounting
   * patch a festival-link failure surfaced as failed writes and this must not
   * become the run that reads green.
   */
  postWriteFailures?: number;
  /** Stage accounting, stored verbatim under metadata.accounting. */
  accounting?: ScreeningAccounting;
  /** Reason the observability diff failed open, if it did. */
  diffFailed?: string;
  /** The health-check precheck failed but we ran the scrape anyway. */
  precheckFailed?: boolean;
}): Promise<void> {
  if (!isDatabaseAvailable) return;

  try {
    const baseline = await getBaseline(params.cinemaId);
    const failedWrites = params.failedWrites ?? 0;
    const postWriteFailures = params.postWriteFailures ?? 0;
    let status = params.status;
    let anomalyType: "low_count" | "zero_results" | "error" | "high_count" | undefined;
    let anomalyDetails: { expectedRange?: { min: number; max: number }; percentChange?: number; errorMessage?: string } | undefined;

    // Detect anomalies against baseline
    if (baseline && params.status === "success") {
      const anomaly = detectAnomaly(baseline, params.screeningCount);
      if (anomaly) {
        status = "anomaly";
        anomalyType = anomaly.type;
        anomalyDetails = anomaly.details;
      }
    }

    // A venue that lost screening writes persisted an INCOMPLETE listing, so it
    // must not read as a clean success — that asymmetry (lost writes recorded
    // "success", a precheck abort recorded "failed") is what made the 2026-08-05
    // run's 31 dropped writes leave no trace. "partial" is an existing
    // scraper_run_status value, so no migration is needed.
    if (failedWrites > 0 && (status === "success" || status === "anomaly")) {
      status = "partial";
      anomalyType = anomalyType ?? "error";
      anomalyDetails = {
        ...anomalyDetails,
        errorMessage: `${failedWrites} screening write(s) failed — partial listing persisted`,
      };
    }

    // A post-write failure also downgrades, with its own message. The listing
    // itself is complete — the rows are in the table — but its follow-up work
    // is not, so the two must stay legible apart. Downgrading at all is the
    // conservative choice: until the accounting patch a festival-link failure
    // propagated into the film-level catch and arrived here as failedWrites,
    // which already produced "partial". Leaving it "success" would have made a
    // previously visible failure disappear.
    // "partial" is included deliberately: the failed-writes branch above may
    // have just set it, and a venue with both kinds of failure must report
    // both. Without it the join below could never concatenate anything.
    if (
      postWriteFailures > 0 &&
      (status === "success" || status === "anomaly" || status === "partial")
    ) {
      status = "partial";
      anomalyType = anomalyType ?? "error";
      anomalyDetails = {
        ...anomalyDetails,
        errorMessage:
          [
            anomalyDetails?.errorMessage,
            `${postWriteFailures} post-write failure(s) — screenings persisted, ` +
              `follow-up work (festival linking) did not`,
          ]
            .filter(Boolean)
            .join("; "),
      };
    }

    // Record error message in anomaly details for failed runs
    if (params.status === "failed" && params.error) {
      anomalyType = "error";
      anomalyDetails = { errorMessage: params.error };
    }

    const failureKind = classifyFailureKind(params.error);

    await db.insert(scraperRuns).values({
      cinemaId: params.cinemaId,
      startedAt: params.startedAt,
      completedAt: new Date(),
      status,
      screeningCount: params.screeningCount,
      baselineCount: baseline?.count ?? null,
      anomalyType,
      anomalyDetails,
      metadata: {
        duration: params.durationMs,
        ...(failureKind ? { failureKind } : {}),
        ...(failedWrites > 0 ? { failedWrites } : {}),
        ...(postWriteFailures > 0 ? { postWriteFailures } : {}),
        ...(params.diffFailed ? { diffFailed: params.diffFailed } : {}),
        ...(params.precheckFailed ? { precheckFailed: true } : {}),
        ...(params.accounting ? { accounting: params.accounting } : {}),
      },
    });
  } catch (err) {
    log({
      level: "warn",
      event: "record_run_failed",
      data: { cinemaId: params.cinemaId, error: err instanceof Error ? err.message : String(err) },
    });
  }
}

// ============================================================================
// Connection-error classification (run-level circuit breaker, plan 001)
// ============================================================================

/**
 * True if the error looks like a DB connection/pooler failure (non-retryable
 * at run level). Used by the scrape-all circuit breaker to distinguish a
 * wedged database (abort the run) from ordinary per-site scrape failures
 * (keep going).
 *
 * Deliberately narrow: a Playwright nav timeout ("page.goto: Timeout 30000ms
 * exceeded") or a venue site refusing connections must NOT count — only
 * markers that can solely originate from the DB path or the venue cap:
 * withDbTimeout rejects with "... (client-side)" (src/db/index.ts) and the
 * venue wall-clock cap appends "(venue wall-clock cap)". ECONNREFUSED counts
 * only on the Postgres ports (5432 direct / 6543 pooler), not a website's
 * 80/443.
 */
export function isConnectionError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("(client-side)") || // withDbTimeout reject marker
    msg.includes("wall-clock cap") || // venue cap expiry
    (msg.includes("econnrefused") && (msg.includes(":5432") || msg.includes(":6543"))) ||
    msg.includes("connect_timeout") || // postgres-js connect timeout
    msg.includes("pool") ||
    msg.includes("max client connections") || // Supavisor at capacity
    msg.includes("remaining connection slots") || // Postgres at capacity
    msg.includes("57014") || // query_canceled (statement_timeout)
    msg.includes("terminating connection") ||
    msg.includes("connection terminated") // postgres-js mid-query drop
  );
}

// ============================================================================
// Per-venue wall-clock cap (plan 001)
// ============================================================================

/**
 * Hard wall-clock cap for a single venue's scrape + pipeline + retries.
 * Default 10 minutes; override via SCRAPE_VENUE_TIMEOUT_MS (floored at 60s).
 * On 2026-06-09 four venues each ran ~13.4h against a wedged Supabase pooler;
 * on 2026-06-11 two runs hung 50/25 min on awaits not covered by the
 * per-query withDbTimeout. This cap bounds the whole venue unit instead.
 */
const VENUE_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.SCRAPE_VENUE_TIMEOUT_MS);
  // A malformed value must fall back to the default, never NaN — setTimeout
  // coerces NaN to 0, which would cap every venue instantly.
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(60_000, parsed) : 10 * 60_000;
})();

/**
 * Race `p` against a wall-clock cap. Rejects on expiry with a message
 * containing "(venue wall-clock cap)" — intentionally matched by
 * isConnectionError so capped venues count toward the breaker. Like withDbTimeout, this
 * stops *waiting* on the promise — the abandoned work keeps running in the
 * background until its own cleanup; that's acceptable because the goal is
 * to unblock the run, not to reclaim the socket.
 */
function withWallClockCap<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timeout after ${ms}ms (venue wall-clock cap)`)),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Run one venue under the wall-clock cap. `runSingleVenue` never rejects
 * (it catches internally and returns a failed VenueResult), so the only
 * rejection path here is the cap itself — record it as a failed venue and
 * let the caller continue to the next one.
 */
async function runVenueWithCap(
  venue: VenueDefinition,
  run: () => Promise<VenueResult>,
): Promise<VenueResult> {
  const startTime = Date.now();
  try {
    return await withWallClockCap(run(), VENUE_TIMEOUT_MS, `venue ${venue.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;
    log({
      level: "error",
      event: "venue_timeout",
      data: { venueId: venue.id, capMs: VENUE_TIMEOUT_MS, durationMs },
    });
    pushPendingRecord(recordScraperRun({
      cinemaId: venue.id,
      startedAt: new Date(startTime),
      status: "failed",
      screeningCount: 0,
      durationMs,
      error: message,
    }));
    return {
      venueId: venue.id,
      venueName: venue.name,
      success: false,
      screeningsFound: 0,
      screeningsAdded: 0,
      screeningsUpdated: 0,
      screeningsFailed: 0,
      // Zero as a compatibility value, NOT a measurement. This path is
      // reached without a pipeline result, and where a pipeline did run
      // and throw it may have written rows before doing so, so the true
      // count is unavailable rather than zero.
      screeningsPostWriteFailures: 0,
      durationMs,
      error: message,
      retryCount: 0,
    };
  }
}

// ============================================================================
// Core Runner
// ============================================================================

async function runSingleVenue(
  venue: VenueDefinition,
  scraper: CinemaScraper,
  options: Required<RunnerOptions>
): Promise<VenueResult> {
  const startTime = Date.now();
  let retryCount = 0;
  let lastError: Error | null = null;

  // Health-check precheck — DIAGNOSTIC ONLY, never an abort, and run exactly
  // ONCE per venue per run.
  //
  // It used to throw, which killed the scrape before it started. The gate
  // was both stricter and less browser-like than the work it gated (10s
  // UA-only vs fetchUrl's 30s + full headers, now aligned in base.ts), and
  // it false-negatives under the 4-way concurrency the nightly run uses:
  // Close-Up's homepage returns 200 in 1.9-6.5s sequentially but breaches
  // 10s in a concurrent burst. Six of 31 registry entries carry
  // healthCheck() overrides that exist only to defeat it. Keep the signal,
  // drop the veto: if the site really is down, the scraper's own error is
  // the honest one to report.
  //
  // It sits OUTSIDE the retry loop deliberately. An advisory probe has no
  // reason to re-run, and re-probing every attempt made a host that
  // black-holes packets cost `retryAttempts + 1` prechecks — 4 × ~98s, since
  // BaseScraper.healthCheck retries internally (3 × 30s + 2 × 4s). That
  // ~400s of probing pushed the venue past VENUE_TIMEOUT_MS, so it failed
  // with "(venue wall-clock cap)" — which isConnectionError DOES match —
  // rather than a site error, which it deliberately does not. Three such
  // venues in a row tripped the run-level circuit breaker (scrape-all.ts) and
  // aborted every remaining scraper plus the enrichment phases, and
  // fewest-screenings-first wave ordering front-loads exactly those thin,
  // flaky venues. Nothing here can throw, so hoisting it above the loop is
  // safe: the inner catch absorbs a throwing override.
  let precheckFailed = false;
  try {
    precheckFailed = !(await scraper.healthCheck());
  } catch (healthError) {
    precheckFailed = true;
    log({
      level: "warn",
      event: "healthcheck_threw",
      data: {
        venueId: venue.id,
        error: healthError instanceof Error ? healthError.message : String(healthError),
      },
    });
  }
  if (precheckFailed) {
    log({
      level: "warn",
      event: "healthcheck_warning",
      data: {
        venueId: venue.id,
        note: "precheck did not return OK — scraping anyway, its own error will surface if the site is down",
      },
    });
  }

  while (retryCount <= options.retryAttempts) {
    try {
      log({
        level: "info",
        event: "scrape_started",
        data: { venueId: venue.id, venueName: venue.name },
      });

      // Scrape
      const screenings = await scraper.scrape();

      log({
        level: "info",
        event: "scrape_completed",
        data: { venueId: venue.id, screeningsFound: screenings.length },
      });

      // Process/save
      let added = 0, updated = 0, failed = 0, postWriteFailures = 0;
      let blocked = false;
      let diffFailed: string | undefined;
      let pipelineResult: Awaited<ReturnType<typeof processScreenings>> | null = null;

      if (screenings.length > 0) {
        // Both branches now read the same fields. The saveScreenings branch
        // used to copy only `added` and drop `updated` and `failed`, so any
        // venue running with useValidation:false reported zero updates and
        // zero failed writes however many there were, taking
        // metadata.failedWrites down with it.
        pipelineResult = options.useValidation
          ? await processScreenings(venue.id, screenings)
          : await saveScreenings(venue.id, screenings);
        added = pipelineResult.added;
        updated = pipelineResult.updated;
        failed = pipelineResult.failed;
        postWriteFailures = pipelineResult.postWriteFailures;
        blocked = pipelineResult.blocked;
        diffFailed = pipelineResult.diffFailed;
      }

      // Stage accounting. Pre-filter counts come off the scraper instance when
      // it extends BaseScraper; otherwise they stay explicitly unavailable.
      const preFilterSource = asPreFilterSource(scraper);
      const accounting = reportAccounting(
        buildAccounting({
          cinemaId: venue.id,
          preFilter: preFilterSource?.getPreFilterReport() ?? null,
          fetchedPayloads: preFilterSource?.getFetchedPayloadCount() ?? null,
          pipeline: pipelineResult,
        })
      );

      // Blocked scrapes are NOT retryable — the diff check detected
      // suspicious data, so retrying would just get blocked again
      if (blocked) {
        const durationMs = Date.now() - startTime;
        log({
          level: "warn",
          event: "venue_blocked",
          data: { venueId: venue.id, screeningsFound: screenings.length, durationMs },
        });
        pushPendingRecord(recordScraperRun({
          cinemaId: venue.id,
          startedAt: new Date(startTime),
          status: "failed",
          screeningCount: screenings.length,
          durationMs,
          error: "scrape_blocked_by_diff_check",
          accounting,
          // No failedWrites here: a blocked scrape attempted no writes at all
          // (the pipeline counts the whole batch `failed`), and conflating that
          // with lost writes would make metadata.failedWrites unusable.
          precheckFailed,
        }));
        return {
          venueId: venue.id,
          venueName: venue.name,
          success: false,
          screeningsFound: screenings.length,
          screeningsAdded: 0,
          screeningsUpdated: 0,
          screeningsFailed: failed,
          // A blocked batch never wrote a row, so it can have no post-write
          // failures. Reported explicitly rather than omitted.
          screeningsPostWriteFailures: 0,
          accounting,
          durationMs,
          error: "scrape_blocked_by_diff_check",
          retryCount,
        };
      }

      const durationMs = Date.now() - startTime;

      log({
        level: "info",
        event: "venue_completed",
        data: {
          venueId: venue.id,
          screeningsFound: screenings.length,
          added,
          updated,
          failed,
          postWriteFailures,
          durationMs,
          retryCount,
          accounting,
        },
      });

      // Record the scraper run (fire-and-forget). recordScraperRun downgrades
      // "success" to "partial" when failedWrites > 0 — a venue that lost writes
      // persisted an incomplete listing and must not read as a clean success.
      pushPendingRecord(recordScraperRun({
        cinemaId: venue.id,
        startedAt: new Date(startTime),
        status: "success",
        screeningCount: screenings.length,
        durationMs,
        failedWrites: failed,
        postWriteFailures,
        diffFailed,
        precheckFailed,
        accounting,
      }));

      return {
        venueId: venue.id,
        venueName: venue.name,
        success: true,
        screeningsFound: screenings.length,
        screeningsAdded: added,
        screeningsUpdated: updated,
        screeningsFailed: failed,
        screeningsPostWriteFailures: postWriteFailures,
        durationMs,
        retryCount,
        accounting,
        // Degradation marker only — success stays true and the rows stay
        // written. The breaker reads it; nothing retries on it.
        diffFailed,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retryCount++;

      if (retryCount <= options.retryAttempts) {
        log({
          level: "warn",
          event: "venue_retry",
          data: {
            venueId: venue.id,
            attempt: retryCount,
            maxAttempts: options.retryAttempts,
            error: lastError.message,
          },
        });
        // Exponential backoff with jitter to avoid thundering herd
        const baseDelay = 1000 * Math.pow(2, retryCount - 1);
        const jitteredDelay = baseDelay * (0.5 + Math.random());
        await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
      }
    }
  }

  // All retries exhausted
  const durationMs = Date.now() - startTime;

  log({
    level: "error",
    event: "venue_failed",
    data: {
      venueId: venue.id,
      error: lastError?.message,
      retryCount: retryCount - 1,
      durationMs,
    },
  });

  // Record failed scraper run (fire-and-forget). metadata.failureKind is
  // classified from lastError, so "lost writes" and "the DB timed out" and
  // "the site broke" stop looking alike in run history.
  pushPendingRecord(recordScraperRun({
    cinemaId: venue.id,
    startedAt: new Date(startTime),
    status: "failed",
    screeningCount: 0,
    durationMs,
    error: lastError?.message,
    precheckFailed,
  }));

  return {
    venueId: venue.id,
    venueName: venue.name,
    success: false,
    screeningsFound: 0,
    screeningsAdded: 0,
    screeningsUpdated: 0,
    screeningsFailed: 0,
    // Zero as a compatibility value, NOT a measurement. This path is
    // reached without a pipeline result, and where a pipeline did run
    // and throw it may have written rows before doing so, so the true
    // count is unavailable rather than zero.
    screeningsPostWriteFailures: 0,
    durationMs,
    error: lastError?.message,
    retryCount: retryCount - 1,
  };
}

// ============================================================================
// Public API
// ============================================================================

const DEFAULT_OPTIONS: Required<RunnerOptions> = {
  retryAttempts: 3,
  continueOnError: true,
  useValidation: true,
  venueIds: [],
  verbose: false,
};

/**
 * Run a scraper configuration with unified error handling and logging
 */
/**
 * Record a venue that could not be initialised, so it counts as a failure
 * instead of vanishing.
 *
 * `ensureCinemaExists` runs outside the per-venue try in every branch. Letting
 * it throw unwinds to the outer catch with `venueResults` still empty, and an
 * empty result set used to aggregate to `success: true` and exit 0. In the
 * chain branch that silently skipped every remaining venue.
 */
function venueInitFailure(
  venue: { id: string; name: string },
  startTime: number,
  error: unknown,
): VenueResult {
  return {
    venueId: venue.id,
    venueName: venue.name,
    success: false,
    screeningsFound: 0,
    screeningsAdded: 0,
    screeningsUpdated: 0,
    screeningsFailed: 0,
    // Zero as a compatibility value, NOT a measurement. This path is
    // reached without a pipeline result, and where a pipeline did run
    // and throw it may have written rows before doing so, so the true
    // count is unavailable rather than zero.
    screeningsPostWriteFailures: 0,
    durationMs: Date.now() - startTime,
    error: error instanceof Error ? error.message : String(error),
    retryCount: 0,
  };
}

export async function runScraper(
  config: ScraperRunnerConfig,
  userOptions: RunnerOptions = {}
): Promise<RunnerResult> {
  // Per-call context for fire-and-forget recordScraperRun pushes — see
  // pendingRecordsContext doc above. The try/finally guarantees the flush
  // runs whether runScraperInner returns or throws, so pending records are
  // always drained before the AsyncLocalStorage context unwinds.
  return pendingRecordsContext.run([], async () => {
    try {
      return await runScraperInner(config, userOptions);
    } finally {
      await flushPendingRecords();
    }
  });
}

async function runScraperInner(
  config: ScraperRunnerConfig,
  userOptions: RunnerOptions = {}
): Promise<RunnerResult> {
  const options: Required<RunnerOptions> = { ...DEFAULT_OPTIONS, ...userOptions };
  const startedAt = new Date();
  const venueResults: VenueResult[] = [];

  log({
    level: "info",
    event: "runner_started",
    data: {
      type: config.type,
      ...(config.type === "chain" && { chain: config.chainName }),
    },
  });

  try {
    if (config.type === "single") {
      // Single venue - simple case
      try {
        await ensureCinemaExists({
          id: config.venue.id,
          name: config.venue.name,
          shortName: config.venue.shortName,
          chain: config.venue.chain,
          website: config.venue.website ?? "",
          address: config.venue.address,
          features: config.venue.features,
        });
      } catch (initError) {
        const failed = venueInitFailure(config.venue, Date.now(), initError);
        log({
          level: "error",
          event: "venue_init_failed",
          data: { venueId: config.venue.id, error: failed.error },
        });
        // Same best-effort record the multi and chain branches write, so a
        // venue that only ever runs standalone is still visible to
        // detectSilentBreakers and detectStaleCinemas. recordScraperRun
        // returns early when the DB is unavailable and swallows its own
        // errors, so this can leave no row and must not change the outcome.
        pushPendingRecord(recordScraperRun({
          cinemaId: config.venue.id,
          startedAt: new Date(),
          status: "failed",
          screeningCount: 0,
          durationMs: 0,
          error: failed.error,
        }));
        venueResults.push(failed);
        throw initError;
      }

      const scraper = config.createScraper();
      const result = await runVenueWithCap(config.venue, () =>
        runSingleVenue(config.venue, scraper, options),
      );
      venueResults.push(result);

    } else if (config.type === "multi") {
      // Multi-venue (like BFI with Southbank + IMAX)
      const venuesToScrape = options.venueIds.length > 0
        ? config.venues.filter((v) => options.venueIds.includes(v.id))
        : config.venues;

      for (const venue of venuesToScrape) {
        try {
          await ensureCinemaExists({
            id: venue.id,
            name: venue.name,
            shortName: venue.shortName,
            chain: venue.chain,
            website: venue.website ?? "",
            address: venue.address,
            features: venue.features,
          });
        } catch (initError) {
          const failed = venueInitFailure(venue, Date.now(), initError);
          log({
            level: "error",
            event: "venue_init_failed",
            data: { venueId: venue.id, error: failed.error },
          });
          pushPendingRecord(recordScraperRun({
            cinemaId: venue.id,
            startedAt: new Date(),
            status: "failed",
            screeningCount: 0,
            durationMs: 0,
            error: failed.error,
          }));
          venueResults.push(failed);
          if (!options.continueOnError) break;
          continue;
        }

        const scraper = config.createScraper(venue.id);
        const result = await runVenueWithCap(venue, () =>
          runSingleVenue(venue, scraper, options),
        );
        venueResults.push(result);

        // Continue on error (retry-then-continue behavior)
        if (!result.success && !options.continueOnError) {
          break;
        }
      }

    } else if (config.type === "chain") {
      // Chain scraper (like Curzon, Picturehouse)
      const activeVenueIds = options.venueIds.length > 0
        ? options.venueIds
        : config.getActiveVenueIds?.() ?? config.venues.map((v) => v.id);

      let venuesToScrape = config.venues.filter((v) => activeVenueIds.includes(v.id));

      // Ensure all venues exist. One venue that cannot be initialised must
      // cost that venue, not the whole chain.
      //
      // `chain` stays the display name ("Curzon"): that is what cinemas.chain
      // has always held, what src/db/schema/cinemas.ts documents, and what the
      // three chain run-*.ts runners still write. Nothing reads this column
      // back through getCinemasByChain, so switching it to the registry's
      // lowercase key would only split the column between entry points.
      const initFailedVenueIds = new Set<string>();
      for (const venue of venuesToScrape) {
        try {
          await ensureCinemaExists({
            id: venue.id,
            name: venue.name,
            shortName: venue.shortName,
            chain: config.chainName,
            website: venue.website ?? "",
            address: venue.address,
            features: venue.features,
          });
        } catch (initError) {
          const failed = venueInitFailure(venue, Date.now(), initError);
          log({
            level: "error",
            event: "venue_init_failed",
            data: { venueId: venue.id, chain: config.chainName, error: failed.error },
          });
          pushPendingRecord(recordScraperRun({
            cinemaId: venue.id,
            startedAt: new Date(),
            status: "failed",
            screeningCount: 0,
            durationMs: 0,
            error: failed.error,
          }));
          venueResults.push(failed);
          initFailedVenueIds.add(venue.id);
        }
      }
      if (initFailedVenueIds.size > 0) {
        venuesToScrape = venuesToScrape.filter((v) => !initFailedVenueIds.has(v.id));
      }

      // Only ask the scraper for venues that actually have a cinemas row. The
      // filtered list is also what the results loop below iterates, so passing
      // the unfiltered activeVenueIds meant the scraper did work for a venue
      // whose row could not be ensured and the result was then discarded.
      const scrapeVenueIds = venuesToScrape.map((v) => v.id);

      if (scrapeVenueIds.length === 0) {
        // Every venue failed to initialise. Their failure results are already
        // recorded; building a chain scraper to ask it for nothing would only
        // risk a network round trip and a misleading log line.
        log({
          level: "error",
          event: "chain_scrape_skipped",
          data: {
            chain: config.chainName,
            reason: "no venue could be initialised",
            venueCount: initFailedVenueIds.size,
          },
        });
      } else {
        // Create chain scraper and scrape all venues at once
        const chainScraper = config.createScraper();
        const startTime = Date.now();

        try {
          // Chain scrapers fetch every venue in one call, so the wall-clock
          // cap scales with venue count (e.g. Curzon ~15 venues). A timeout
          // rejects into the catch below, which marks all venues failed.
          const chainCapMs = VENUE_TIMEOUT_MS * Math.max(1, venuesToScrape.length);
          const results = await withWallClockCap(
            chainScraper.scrapeVenues(scrapeVenueIds),
            chainCapMs,
            `chain ${config.chainName}`,
          );

          // Process every requested venue so omitted results become explicit failures.
          for (const venue of venuesToScrape) {
            const venueId = venue.id;
            const screenings = results.get(venueId);
            if (!screenings) {
              const error = chainScraper.venueErrors?.get(venueId)
                ?? `Chain scraper returned no result for requested venue ${venueId}`;
              pushPendingRecord(recordScraperRun({
                cinemaId: venueId,
                startedAt: new Date(startTime),
                status: "failed",
                screeningCount: 0,
                durationMs: Date.now() - startTime,
                error,
              }));
              venueResults.push({
                venueId,
                venueName: venue.name,
                success: false,
                screeningsFound: 0,
                screeningsAdded: 0,
                screeningsUpdated: 0,
                screeningsFailed: 0,
                // Zero as a compatibility value, NOT a measurement. This path is
                // reached without a pipeline result, and where a pipeline did run
                // and throw it may have written rows before doing so, so the true
                // count is unavailable rather than zero.
                screeningsPostWriteFailures: 0,
                durationMs: Date.now() - startTime,
                error,
                retryCount: 0,
              });
              continue;
            }

            const venueStartTime = Date.now();
            let added = 0, updated = 0, failed = 0, postWriteFailures = 0;
            let venueBlocked = false;
            let diffFailed: string | undefined;
            let pipelineError: string | undefined;

            if (screenings.length > 0) {
              // Per-venue try: one venue's pipeline failure must not abort its
              // siblings. This block used to sit bare inside the chain's single
              // try below, so a single venue's DB timeout marked ALL venues in the
              // chain failed with that venue's error message (2026-08-05: 11
              // Picturehouse venues killed by one venue's diff timeout).
              try {
                // Both branches read the same fields. The saveScreenings
                // branch used to copy only `added`, so a chain venue running
                // with useValidation:false reported zero updates and zero
                // failed writes however many there were, taking
                // metadata.failedWrites down with it — the same defect the
                // single-venue path carried.
                const pipelineResult = options.useValidation
                  ? await processScreenings(venueId, screenings)
                  : await saveScreenings(venueId, screenings);
                added = pipelineResult.added;
                updated = pipelineResult.updated;
                failed = pipelineResult.failed;
                postWriteFailures = pipelineResult.postWriteFailures;
                venueBlocked = pipelineResult.blocked;
                diffFailed = pipelineResult.diffFailed;
              } catch (pipeErr) {
                pipelineError = pipeErr instanceof Error ? pipeErr.message : String(pipeErr);
                log({
                  level: "error",
                  event: "venue_pipeline_failed",
                  data: { venueId, screeningsFound: screenings.length, error: pipelineError },
                });
              }
            }

            if (venueBlocked) {
              log({
                level: "warn",
                event: "venue_blocked",
                data: { venueId, screeningsFound: screenings.length },
              });
            }

            const venueError = pipelineError ?? (venueBlocked ? "scrape_blocked_by_diff_check" : undefined);

            // NOTE: no stage accounting is built here. `buildAccounting` and
            // `reportAccounting` are wired in runSingleVenue only, so chain
            // venues (Curzon, Picturehouse, Everyman) log no `[Accounting]`
            // line and store no `metadata.accounting`. Nothing blocks it —
            // `accepted`, `write`, `rejected` and `postWriteFailures` are all
            // on pipelineResult above, and per-venue `parsed`/`preFiltered`/
            // `fetchedPayloads` are genuinely unavailable for a chain (one
            // validate() covers every venue), which is what UNAVAILABLE is
            // for. Left out of this patch to keep its scope; the docs state
            // the single-venue-only limit rather than implying coverage.

            // Record chain per-venue scraper run (fire-and-forget). recordScraperRun
            // downgrades "success" to "partial" when failedWrites > 0.
            pushPendingRecord(recordScraperRun({
              cinemaId: venueId,
              startedAt: new Date(venueStartTime),
              status: venueError ? "failed" : "success",
              screeningCount: screenings.length,
              durationMs: Date.now() - venueStartTime,
              error: venueError,
              // A blocked scrape attempted no writes, so its whole-batch `failed`
              // count is not "lost writes" — see the single-venue path.
              failedWrites: venueBlocked ? 0 : failed,
              postWriteFailures,
              diffFailed,
            }));

            venueResults.push({
              venueId,
              venueName: venue.name,
              success: !venueError,
              screeningsFound: screenings.length,
              screeningsAdded: venueError ? 0 : added,
              screeningsUpdated: venueError ? 0 : updated,
              screeningsFailed: failed,
              screeningsPostWriteFailures: postWriteFailures,
              durationMs: Date.now() - venueStartTime,
              error: venueError,
              retryCount: 0,
              // Degradation marker only — see the single-venue path. In the chain
              // shape this matters most: one starved venue's diff timeout is the
              // whole run's canary even though its 10 siblings wrote fine.
              diffFailed,
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log({
            level: "error",
            event: "chain_scrape_failed",
            data: { chain: config.chainName, error: errorMessage },
          });

          // Mark all venues as failed
          for (const venue of venuesToScrape) {
            // Record chain failure per-venue (fire-and-forget)
            pushPendingRecord(recordScraperRun({
              cinemaId: venue.id,
              startedAt: new Date(startTime),
              status: "failed",
              screeningCount: 0,
              durationMs: Date.now() - startTime,
              error: errorMessage,
            }));

            venueResults.push({
              venueId: venue.id,
              venueName: venue.name,
              success: false,
              screeningsFound: 0,
              screeningsAdded: 0,
              screeningsUpdated: 0,
              screeningsFailed: 0,
              // Zero as a compatibility value, NOT a measurement. This path is
              // reached without a pipeline result, and where a pipeline did run
              // and throw it may have written rows before doing so, so the true
              // count is unavailable rather than zero.
              screeningsPostWriteFailures: 0,
              durationMs: Date.now() - startTime,
              error: errorMessage,
              retryCount: 0,
            });
          }
        }
      }
    }
  } catch (error) {
    log({
      level: "error",
      event: "runner_error",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  // Aggregate results
  const result: RunnerResult = {
    // An empty result set is a failure, not a vacuous success. `[].every(...)`
    // is true, so a throw before any venue ran used to exit 0 and be
    // checkpointed as done by --resume.
    success: venueResults.length > 0 && venueResults.every((r) => r.success),
    startedAt,
    completedAt,
    durationMs,
    venueResults,
    totalScreeningsFound: venueResults.reduce((sum, r) => sum + r.screeningsFound, 0),
    totalScreeningsAdded: venueResults.reduce((sum, r) => sum + r.screeningsAdded, 0),
    totalScreeningsUpdated: venueResults.reduce((sum, r) => sum + r.screeningsUpdated, 0),
    totalVenuesSucceeded: venueResults.filter((r) => r.success).length,
    totalVenuesFailed: venueResults.filter((r) => !r.success).length,
  };

  log({
    level: result.success ? "info" : "warn",
    event: "runner_completed",
    data: {
      success: result.success,
      durationMs: result.durationMs,
      venuesSucceeded: result.totalVenuesSucceeded,
      venuesFailed: result.totalVenuesFailed,
      screeningsFound: result.totalScreeningsFound,
      screeningsAdded: result.totalScreeningsAdded,
      screeningsUpdated: result.totalScreeningsUpdated,
    },
  });

  // Note: flushPendingRecords runs in the runScraper wrapper's `finally`
  // — guaranteed regardless of whether this function returns or throws.
  return result;
}

// ============================================================================
// Yield Evaluation (for AutoScrape experiments)
// ============================================================================

/** Result of a yield-mode scrape — raw screenings without DB persistence */
interface YieldResult {
  success: boolean;
  screenings: RawScreening[];
  durationMs: number;
  error?: string;
}

/**
 * Run a single-venue scraper and return raw screenings WITHOUT persisting.
 * Used by AutoScrape to evaluate candidate configs in dry-run mode.
 * No DB writes, no recording, no pipeline processing.
 */
export async function runScraperForYield(
  config: SingleVenueConfig
): Promise<YieldResult> {
  const startTime = Date.now();

  try {
    const scraper = config.createScraper();

    const isHealthy = await scraper.healthCheck();
    if (!isHealthy) {
      return {
        success: false,
        screenings: [],
        durationMs: Date.now() - startTime,
        error: "Health check failed - site not accessible",
      };
    }

    const screenings = await scraper.scrape();

    return {
      success: true,
      screenings,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      screenings: [],
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Parse CLI arguments for venue selection
 * Supports: npm run scrape:curzon -- soho mayfair
 */
function parseVenueArgs(prefix?: string): string[] {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return [];
  }

  return args.map((arg) => {
    // Allow shorthand like "soho" -> "curzon-soho"
    if (prefix && !arg.startsWith(prefix)) {
      return `${prefix}${arg}`;
    }
    return arg;
  });
}

/**
 * Create a main function for a scraper entry point
 * Handles process exit codes and error logging
 */
export function createMain(
  config: ScraperRunnerConfig,
  options?: RunnerOptions & { venuePrefix?: string }
): () => Promise<void> {
  return async () => {
    const venueIds = parseVenueArgs(options?.venuePrefix);
    const runnerOptions: RunnerOptions = {
      ...options,
      // Use CLI args if provided, otherwise use options.venueIds, defaulting to [] if neither
      venueIds: venueIds.length > 0 ? venueIds : (options?.venueIds ?? []),
    };

    const result = await runScraper(config, runnerOptions);

    if (!result.success) {
      // runScraper's wrapper finally already flushed pending records inside
      // its AsyncLocalStorage context — calling flushPendingRecords here
      // would be a no-op (no active store) so we just exit.
      process.exit(1);
    }
  };
}
