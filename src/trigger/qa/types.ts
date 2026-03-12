/**
 * QA Cleanup Agent — Shared Types
 *
 * Interfaces for the 3-task QA pipeline:
 *   qa-orchestrator → qa-browse → qa-analyze-and-fix
 */

// ── Browse Task Output ──────────────────────────────────────────

/** Output of the QA browse task: films, screenings, and booking checks extracted from the front end */
export interface QaBrowseOutput {
  extractedAt: string;
  dates: [string, string]; // [today, tomorrow] ISO date strings
  expectedFilmCount: number; // from DB pre-check
  films: FrontEndFilm[];
  screenings: FrontEndScreening[];
  bookingChecks: BookingCheck[];
  errors: BrowseError[];
  stats: BrowseStats;
}

/** A film card as seen on the pictures.london front end */
export interface FrontEndFilm {
  slug: string;
  title: string;
  posterUrl: string | null;
  letterboxdRating: number | null;
  screeningCount: number;
}

/** A screening listing as seen on the pictures.london front end */
export interface FrontEndScreening {
  filmSlug: string;
  filmTitle: string;
  cinemaName: string;
  cinemaId: string | null; // resolved during analysis
  datetime: string; // ISO string, extracted from structured data or parsed from display
  bookingUrl: string;
  screen: string | null;
  format: string | null;
}

/** Result of verifying a booking URL is accessible and shows the correct film */
export interface BookingCheck {
  screeningId: string; // matched during analysis, may be empty during browse
  url: string;
  cinemaId: string;
  usedStealth: boolean;
  firstAttemptStatus: number | "timeout" | "error";
  secondAttemptStatus: number | "timeout" | "error" | "not_attempted";
  detectedFilmTitle: string | null;
  detectedTime: string | null;
  confidence: number;
}

export interface BrowseError {
  cinemaId?: string;
  url?: string;
  message: string;
}

export interface BrowseStats {
  filmsExtracted: number;
  screeningsExtracted: number;
  bookingsChecked: number;
  durationMs: number;
}

// ── Analysis Types ──────────────────────────────────────────────

export interface QaAnalysisInput {
  browseOutput: QaBrowseOutput;
  dryRun: boolean;
}

export interface QaAnalysisOutput {
  issuesFound: ClassifiedIssue[];
  fixesApplied: FixResult[];
  preventionReport: string | null;
  stats: AnalysisStats;
}

export interface AnalysisStats {
  totalIssues: number;
  fixesApplied: number;
  fixesSkipped: number;
  durationMs: number;
}

// ── Issue Classification ────────────────────────────────────────

export type IssueScope = "spot" | "systemic";

export type QaIssueType =
  | "stale_screening"
  | "time_mismatch"
  | "broken_booking_link"
  | "booking_page_wrong_film"
  | "tmdb_mismatch"
  | "missing_letterboxd"
  | "front_end_db_mismatch";

/** A data quality issue classified by type, scope, and severity */
export interface ClassifiedIssue {
  type: QaIssueType;
  scope: IssueScope;
  severity: "critical" | "warning" | "info";
  entityType: "screening" | "film" | "cinema";
  entityId: string;
  description: string;
  suggestedFix: string | null;
  confidence: number; // 0-1
  metadata?: Record<string, unknown>;
}

// ── Fix Results ─────────────────────────────────────────────────

export type FixAction =
  | "deleted_stale_screening"
  | "updated_screening_time"
  | "re_matched_tmdb"
  | "enriched_letterboxd"
  | "flagged_broken_link"
  | "flagged_for_review";

/** Outcome of attempting to fix a classified issue (may be dry run) */
export interface FixResult {
  issue: ClassifiedIssue;
  action: FixAction;
  applied: boolean; // false if dry run or verification failed
  note: string;
}

// ── Verification Gate ───────────────────────────────────────────

export interface VerificationOutcome {
  confirmed: boolean;
  method: string;
  reason: string;
}

// ── Orchestrator ────────────────────────────────────────────────

export interface QaOrchestratorInput {
  dryRun?: boolean;
  triggeredBy?: string;
}

/** Final output of the QA orchestrator: aggregated stats and fix counts */
export interface QaOrchestratorOutput {
  skipped?: boolean;
  reason?: string;
  browseStats?: BrowseStats;
  analysisStats?: AnalysisStats;
  issueCount?: number;
  fixCount?: number;
}
