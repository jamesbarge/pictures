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

/** An error encountered during QA browse phase (non-fatal) */
export interface BrowseError {
  cinemaId?: string;
  url?: string;
  message: string;
}

/** Aggregate stats from the QA browse task */
export interface BrowseStats {
  filmsExtracted: number;
  screeningsExtracted: number;
  bookingsChecked: number;
  durationMs: number;
}

// ── Analysis Types ──────────────────────────────────────────────

/** Input payload for the QA analysis task: browse output plus dry-run flag */
export interface QaAnalysisInput {
  browseOutput: QaBrowseOutput;
  dryRun: boolean;
}

/** Output of the QA analysis task: classified issues, applied fixes, and prevention report */
export interface QaAnalysisOutput {
  issuesFound: ClassifiedIssue[];
  fixesApplied: FixResult[];
  preventionReport: string | null;
  stats: AnalysisStats;
}

/** Aggregate stats from the QA analysis phase */
export interface AnalysisStats {
  totalIssues: number;
  fixesApplied: number;
  fixesSkipped: number;
  durationMs: number;
}

// ── Issue Classification ────────────────────────────────────────

/** Whether an issue affects a single entity ("spot") or indicates a pattern ("systemic") */
export type IssueScope = "spot" | "systemic";

/** Classification of data quality issues detected by the QA pipeline */
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

/** Action taken to fix a classified issue */
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

/** Result of the verification gate that confirms a fix before applying it */
export interface VerificationOutcome {
  confirmed: boolean;
  method: string;
  reason: string;
}

// ── Orchestrator ────────────────────────────────────────────────

/** Input payload for the QA orchestrator: optional dry-run and trigger source */
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
