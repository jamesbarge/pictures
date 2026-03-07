/**
 * Scraper Runner Factory
 *
 * Unified runner for all cinema scrapers with:
 * - Structured JSON logging for production
 * - Retry-then-continue error handling
 * - Support for single-venue, multi-venue, and chain scrapers
 * - Consistent health checks and pipeline processing
 */

import type { CinemaScraper, RawScreening, ChainScraper, VenueConfig } from "./types";
import { processScreenings, saveScreenings, ensureCinemaExists } from "./pipeline";
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

export interface VenueResult {
  venueId: string;
  venueName: string;
  success: boolean;
  screeningsFound: number;
  screeningsAdded: number;
  screeningsUpdated: number;
  screeningsFailed: number;
  durationMs: number;
  error?: string;
  retryCount: number;
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
// Run Recording (fire-and-forget with flush)
// ============================================================================

/** Pending record promises — collected so we can flush before process exit */
const pendingRecords: Promise<void>[] = [];

/**
 * Await all pending recordScraperRun writes (with a 5s timeout).
 * Call before process.exit to prevent data loss.
 */
export async function flushPendingRecords(): Promise<void> {
  if (pendingRecords.length === 0) return;
  const pending = pendingRecords.splice(0);
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
async function recordScraperRun(params: {
  cinemaId: string;
  startedAt: Date;
  status: "success" | "failed" | "anomaly" | "partial";
  screeningCount: number;
  durationMs: number;
  error?: string;
}): Promise<void> {
  if (!isDatabaseAvailable) return;

  try {
    const baseline = await getBaseline(params.cinemaId);
    let status = params.status;
    let anomalyType: "low_count" | "zero_results" | "error" | "high_count" | undefined;
    let anomalyDetails: { expectedRange?: { min: number; max: number }; percentChange?: number; errorMessage?: string } | undefined;

    // Detect anomalies against baseline
    if (baseline && params.status === "success") {
      const { count: baselineCount, tolerance } = baseline;
      const deviation = baselineCount > 0
        ? Math.abs(params.screeningCount - baselineCount) / baselineCount * 100
        : 0;

      if (deviation > tolerance) {
        status = "anomaly";
        anomalyType = params.screeningCount === 0
          ? "zero_results"
          : params.screeningCount < baselineCount
            ? "low_count"
            : "high_count";
        anomalyDetails = {
          expectedRange: {
            min: Math.round(baselineCount * (1 - tolerance / 100)),
            max: Math.round(baselineCount * (1 + tolerance / 100)),
          },
          percentChange: Math.round(deviation),
        };
      }
    }

    // Record error message in anomaly details for failed runs
    if (params.status === "failed" && params.error) {
      anomalyType = "error";
      anomalyDetails = { errorMessage: params.error };
    }

    await db.insert(scraperRuns).values({
      cinemaId: params.cinemaId,
      startedAt: params.startedAt,
      completedAt: new Date(),
      status,
      screeningCount: params.screeningCount,
      baselineCount: baseline?.count ?? null,
      anomalyType,
      anomalyDetails,
      metadata: { duration: params.durationMs },
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

  while (retryCount <= options.retryAttempts) {
    try {
      // Health check
      const isHealthy = await scraper.healthCheck();
      if (!isHealthy) {
        throw new Error("Health check failed - site not accessible");
      }

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
      let added = 0, updated = 0, failed = 0;
      let blocked = false;

      if (screenings.length > 0) {
        if (options.useValidation) {
          const result = await processScreenings(venue.id, screenings);
          added = result.added;
          updated = result.updated;
          failed = result.failed;
          blocked = result.blocked;
        } else {
          const result = await saveScreenings(venue.id, screenings);
          added = result.added;
          blocked = result.blocked;
        }
      }

      // Blocked scrapes are NOT retryable — the diff check detected
      // suspicious data, so retrying would just get blocked again
      if (blocked) {
        const durationMs = Date.now() - startTime;
        log({
          level: "warn",
          event: "venue_blocked",
          data: { venueId: venue.id, screeningsFound: screenings.length, durationMs },
        });
        pendingRecords.push(recordScraperRun({
          cinemaId: venue.id,
          startedAt: new Date(startTime),
          status: "failed",
          screeningCount: screenings.length,
          durationMs,
          error: "scrape_blocked_by_diff_check",
        }));
        return {
          venueId: venue.id,
          venueName: venue.name,
          success: false,
          screeningsFound: screenings.length,
          screeningsAdded: 0,
          screeningsUpdated: 0,
          screeningsFailed: failed,
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
          durationMs,
          retryCount,
        },
      });

      // Record successful scraper run (fire-and-forget)
      pendingRecords.push(recordScraperRun({
        cinemaId: venue.id,
        startedAt: new Date(startTime),
        status: "success",
        screeningCount: screenings.length,
        durationMs,
      }));

      return {
        venueId: venue.id,
        venueName: venue.name,
        success: true,
        screeningsFound: screenings.length,
        screeningsAdded: added,
        screeningsUpdated: updated,
        screeningsFailed: failed,
        durationMs,
        retryCount,
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

  // Record failed scraper run (fire-and-forget)
  pendingRecords.push(recordScraperRun({
    cinemaId: venue.id,
    startedAt: new Date(startTime),
    status: "failed",
    screeningCount: 0,
    durationMs,
    error: lastError?.message,
  }));

  return {
    venueId: venue.id,
    venueName: venue.name,
    success: false,
    screeningsFound: 0,
    screeningsAdded: 0,
    screeningsUpdated: 0,
    screeningsFailed: 0,
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
export async function runScraper(
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
      await ensureCinemaExists({
        id: config.venue.id,
        name: config.venue.name,
        shortName: config.venue.shortName,
        chain: config.venue.chain,
        website: config.venue.website ?? "",
        address: config.venue.address,
        features: config.venue.features,
      });

      const scraper = config.createScraper();
      const result = await runSingleVenue(config.venue, scraper, options);
      venueResults.push(result);

    } else if (config.type === "multi") {
      // Multi-venue (like BFI with Southbank + IMAX)
      const venuesToScrape = options.venueIds.length > 0
        ? config.venues.filter((v) => options.venueIds.includes(v.id))
        : config.venues;

      for (const venue of venuesToScrape) {
        await ensureCinemaExists({
          id: venue.id,
          name: venue.name,
          shortName: venue.shortName,
          chain: venue.chain,
          website: venue.website ?? "",
          address: venue.address,
          features: venue.features,
        });

        const scraper = config.createScraper(venue.id);
        const result = await runSingleVenue(venue, scraper, options);
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

      const venuesToScrape = config.venues.filter((v) => activeVenueIds.includes(v.id));

      // Ensure all venues exist
      for (const venue of venuesToScrape) {
        await ensureCinemaExists({
          id: venue.id,
          name: venue.name,
          shortName: venue.shortName,
          chain: config.chainName,
          website: venue.website ?? "",
          address: venue.address,
          features: venue.features,
        });
      }

      // Create chain scraper and scrape all venues at once
      const chainScraper = config.createScraper();
      const startTime = Date.now();

      try {
        const results = await chainScraper.scrapeVenues(activeVenueIds);

        // Process results for each venue
        for (const [venueId, screenings] of results) {
          const venue = venuesToScrape.find((v) => v.id === venueId);
          if (!venue) continue;

          const venueStartTime = Date.now();
          let added = 0, updated = 0, failed = 0;
          let venueBlocked = false;

          if (screenings.length > 0) {
            if (options.useValidation) {
              const pipelineResult = await processScreenings(venueId, screenings);
              added = pipelineResult.added;
              updated = pipelineResult.updated;
              failed = pipelineResult.failed;
              venueBlocked = pipelineResult.blocked;
            } else {
              const pipelineResult = await saveScreenings(venueId, screenings);
              added = pipelineResult.added;
              venueBlocked = pipelineResult.blocked;
            }
          }

          if (venueBlocked) {
            log({
              level: "warn",
              event: "venue_blocked",
              data: { venueId, screeningsFound: screenings.length },
            });
          }

          // Record chain per-venue scraper run (fire-and-forget)
          pendingRecords.push(recordScraperRun({
            cinemaId: venueId,
            startedAt: new Date(venueStartTime),
            status: venueBlocked ? "failed" : "success",
            screeningCount: screenings.length,
            durationMs: Date.now() - venueStartTime,
            error: venueBlocked ? "scrape_blocked_by_diff_check" : undefined,
          }));

          venueResults.push({
            venueId,
            venueName: venue.name,
            success: !venueBlocked,
            screeningsFound: screenings.length,
            screeningsAdded: venueBlocked ? 0 : added,
            screeningsUpdated: venueBlocked ? 0 : updated,
            screeningsFailed: failed,
            durationMs: Date.now() - venueStartTime,
            error: venueBlocked ? "scrape_blocked_by_diff_check" : undefined,
            retryCount: 0,
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
          pendingRecords.push(recordScraperRun({
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
            durationMs: Date.now() - startTime,
            error: errorMessage,
            retryCount: 0,
          });
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
    success: venueResults.every((r) => r.success),
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

  // Flush any pending record writes before returning
  await flushPendingRecords();

  return result;
}

/**
 * Parse CLI arguments for venue selection
 * Supports: npm run scrape:curzon -- soho mayfair
 */
export function parseVenueArgs(prefix?: string): string[] {
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
      await flushPendingRecords();
      process.exit(1);
    }
  };
}
