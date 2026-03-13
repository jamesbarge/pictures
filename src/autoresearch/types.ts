/**
 * AutoResearch Types
 *
 * Shared types for the autoresearch experiment framework.
 * Inspired by Karpathy's autoresearch: iterate → evaluate → keep/discard.
 */

/** Which autoresearch system produced the experiment */
export type ExperimentSystem = "autoscrape" | "autoquality" | "autoconvert";

/** The config snapshot stored per experiment (system-specific) */
export type ConfigSnapshot =
  | AutoScrapeConfig
  | AutoQualityConfig
  | Record<string, unknown>;

/**
 * A single experiment result — the core unit of autoresearch.
 * Every experiment: measure baseline → apply change → measure again → decide.
 */
export interface ExperimentResult {
  system: ExperimentSystem;
  /** What was changed (selector override, threshold tweak, etc.) */
  configSnapshot: ConfigSnapshot;
  /** Metric value before the experiment */
  metricBefore: number;
  /** Metric value after the experiment */
  metricAfter: number;
  /** Whether the change was kept */
  kept: boolean;
  /** Human-readable notes on what happened */
  notes: string;
  /** How long the experiment took (ms) */
  durationMs: number;
  /** Tokens consumed by AI reasoning (if any) */
  tokensUsed?: number;
}

// ---------------------------------------------------------------------------
// AutoScrape types
// ---------------------------------------------------------------------------

/** Config overlay for a cinema scraper — the "mutable code" in autoresearch terms */
export interface AutoScrapeConfig {
  cinemaId: string;
  /** CSS selector overrides keyed by purpose (e.g. "filmTitle", "datetime", "bookingUrl") */
  selectorOverrides: Record<string, string>;
  /** URL pattern overrides (e.g. listing page URL changed) */
  urlOverrides?: Record<string, string>;
  /** Date format overrides for parsing */
  dateFormatOverrides?: Record<string, string>;
  /** Any extra context the agent wants to persist between experiments */
  agentNotes?: string;
}

/** Composite yield score components (0-100 each, weighted into final score) */
export interface YieldScoreBreakdown {
  /** screenings_found / baseline_expected (capped at 1.0) */
  screeningYield: number;
  /** Percentage of screenings with valid times (10:00-23:59) */
  validTimePercent: number;
  /** Percentage of screenings matched to a TMDB film */
  tmdbMatchRate: number;
  /** Percentage of booking URLs that are valid */
  bookingUrlValidRate: number;
  /** Final weighted score (0-100) */
  compositeScore: number;
}

/** Input for the yield scorer — gathered from a dry-run scrape */
export interface YieldScorerInput {
  cinemaId: string;
  screeningsFound: number;
  baselineExpected: number;
  validTimeCount: number;
  totalWithTime: number;
  tmdbMatchedCount: number;
  totalFilms: number;
  validBookingUrls: number;
  totalBookingUrls: number;
}

/** HTML snapshot for diffing cinema websites */
export interface HtmlSnapshot {
  cinemaId: string;
  url: string;
  html: string;
  capturedAt: Date;
  /** CSS selectors that were active when this snapshot was taken */
  activeSelectors?: Record<string, string>;
}

/** Diff between two HTML snapshots */
export interface HtmlDiff {
  cinemaId: string;
  /** Whether the page structure changed significantly */
  structureChanged: boolean;
  /** Summary of what changed (for the agent prompt) */
  changeSummary: string;
  /** Selectors that no longer match any elements */
  brokenSelectors: string[];
  /** New elements that might be screening containers */
  candidateSelectors: string[];
}

// ---------------------------------------------------------------------------
// AutoQuality types
// ---------------------------------------------------------------------------

/** Tunable thresholds for the data quality pipeline */
export interface AutoQualityConfig {
  /** Which threshold was changed in this experiment */
  thresholdKey: string;
  /** Previous value */
  previousValue: number;
  /** New value */
  newValue: number;
}

/** Data Quality Score components (higher is better, 0-100) */
export interface DqsBreakdown {
  missingTmdbPercent: number;
  missingPosterPercent: number;
  missingSynopsisPercent: number;
  duplicatesPercent: number;
  dodgyEntriesPercent: number;
  /** Final DQS = 100 - weighted sum of above */
  compositeScore: number;
}

/** Safety floors that AutoQuality experiments must never breach */
export interface QualitySafetyFloors {
  /** Minimum auto-merge similarity threshold */
  minAutoMergeSimilarity: number;
  /** Minimum TMDB auto-apply confidence */
  minTmdbConfidence: number;
  /** Maximum new non-film patterns per experiment */
  maxNewNonFilmPatterns: number;
}

export const DEFAULT_SAFETY_FLOORS: QualitySafetyFloors = {
  minAutoMergeSimilarity: 0.85,
  minTmdbConfidence: 0.6,
  maxNewNonFilmPatterns: 3,
};

// ---------------------------------------------------------------------------
// Overnight run summary (sent via Telegram)
// ---------------------------------------------------------------------------

export interface OvernightSummary {
  system: ExperimentSystem;
  runStartedAt: Date;
  runCompletedAt: Date;
  totalExperiments: number;
  experimentsKept: number;
  experimentsDiscarded: number;
  /** Per-target summaries (cinema IDs for AutoScrape, threshold keys for AutoQuality) */
  targetSummaries: TargetSummary[];
}

export interface TargetSummary {
  targetId: string;
  targetName: string;
  metricBefore: number;
  metricAfter: number;
  experimentsRun: number;
  recovered: boolean;
  needsManualAttention: boolean;
}
