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

      if (screenings.length > 0) {
        if (options.useValidation) {
          const result = await processScreenings(venue.id, screenings);
          added = result.added;
          updated = result.updated;
          failed = result.failed;
        } else {
          await saveScreenings(venue.id, screenings);
          added = screenings.length;
        }
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
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
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

          let added = 0, updated = 0, failed = 0;

          if (screenings.length > 0) {
            if (options.useValidation) {
              const pipelineResult = await processScreenings(venueId, screenings);
              added = pipelineResult.added;
              updated = pipelineResult.updated;
              failed = pipelineResult.failed;
            } else {
              await saveScreenings(venueId, screenings);
              added = screenings.length;
            }
          }

          venueResults.push({
            venueId,
            venueName: venue.name,
            success: true,
            screeningsFound: screenings.length,
            screeningsAdded: added,
            screeningsUpdated: updated,
            screeningsFailed: failed,
            durationMs: Date.now() - startTime,
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
      venueIds: venueIds.length > 0 ? venueIds : options?.venueIds,
    };

    const result = await runScraper(config, runnerOptions);

    if (!result.success) {
      process.exit(1);
    }
  };
}
