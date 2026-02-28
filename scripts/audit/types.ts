/**
 * Shared types for the front-end audit suite.
 * All checkers produce AuditIssue[] and the orchestrator collects them.
 */

export type IssueSeverity = "critical" | "warning" | "info";

export type IssueCategory =
  | "missing_poster"
  | "broken_booking_link"
  | "non_film_content"
  | "title_not_clean"
  | "no_screenings"
  | "screening_gap"
  | "suspicious_screening_pattern"
  | "unreasonable_time"
  | "past_screening"
  | "card_detail_mismatch"
  | "duplicate_film_card"
  | "duplicate_cinema"
  | "broken_page"
  | "missing_tmdb_data"
  | "booking_domain_mismatch";

export interface AuditIssue {
  severity: IssueSeverity;
  category: IssueCategory;
  /** Short human-readable summary */
  message: string;
  /** Entity this relates to (film title, cinema name, etc.) */
  entity: string;
  /** Additional structured data for the report */
  details: Record<string, unknown>;
  /** URL of the page where the issue was found */
  url?: string;
  /** Path to a screenshot if captured */
  screenshot?: string;
}

/** Extracted data from a film card on the calendar page */
export interface FilmCardData {
  filmId: string;
  title: string;
  year?: number;
  director?: string;
  screeningCount: number;
  cinemaDisplay: string;
  posterSrc: string;
  isPlaceholder: boolean;
  href: string;
}

/** Extracted data from a film detail page */
export interface FilmDetailData {
  filmId: string;
  title: string;
  year?: number;
  directors: string[];
  posterSrc: string;
  isPlaceholder: boolean;
  synopsis?: string;
  tmdbLink: boolean;
  letterboxdRating?: number;
  screeningCount: number;
  bookingUrls: string[];
  cinemaNames: string[];
}

/** Cinema entry from the /cinemas directory */
export interface CinemaListEntry {
  name: string;
  slug: string;
  area?: string;
  screeningCount: number;
}

/** Cinema detail page data */
export interface CinemaDetailData {
  name: string;
  slug: string;
  screeningCount: number;
  latestScreeningDate?: string;
  screeningDates: string[];
  bookingUrls: string[];
}

/** Summary stats for the final report */
export interface AuditSummary {
  cinemasTotal: number;
  cinemasTested: number;
  filmsTotal: number;
  filmsTested: number;
  bookingLinksTotal: number;
  bookingLinksTested: number;
  issuesTotal: number;
  issuesCritical: number;
  issuesWarning: number;
  issuesInfo: number;
  duration: number;
}

export interface AuditResult {
  summary: AuditSummary;
  issues: AuditIssue[];
  cinemaReports: CinemaDetailData[];
  timestamp: string;
}
