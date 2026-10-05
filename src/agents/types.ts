/**
 * Type definitions shared by the data quality agents
 */

// Data issue types flagged by agents
export type DataIssueType =
  | "broken_link"
  | "wrong_time"
  | "duplicate_film"
  | "duplicate_screening"
  | "missing_metadata"
  | "scraper_anomaly"
  | "tmdb_mismatch"
  | "showtime_anomaly"
  | "booking_url_anomaly"
  | "stale_screening"
  | "non_film_content"
  | "suspicious_showtimes"
  | "navigation_scrape"
  | "html_in_title"
  | "duplicate_titles"
  | "encoding_issue"
  | "front_end_db_mismatch"
  | "booking_page_wrong_film";

// Severity levels for issues
export type IssueSeverity = "critical" | "warning" | "info";

// Issue status for tracking resolution
export type IssueStatus = "open" | "auto_fixed" | "manually_fixed" | "ignored";

/**
 * TMDB match result from enrichment agent
 */
export interface TmdbMatchResult {
  filmId: string;
  originalTitle: string;
  tmdbId: number;
  matchedTitle: string;
  confidence: number;
  matchStrategy:
    | "exact"
    | "fuzzy"
    | "extracted"  // Title extracted from event wrapper
    | "year_adjusted"
    | "director_search"
    | "agent"  // AI suggested alternative title
    | "embedding_similarity";
  shouldAutoApply: boolean;
}

/**
 * Agent execution result
 */
export interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  tokensUsed: number;
  executionTimeMs: number;
  agentName: string;
  timestamp: Date;
}
