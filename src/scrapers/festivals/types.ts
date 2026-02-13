/**
 * Festival Scraper Types
 * Shared types for the festival detection and tagging system.
 */

/**
 * How confident we are that a screening belongs to a festival.
 * - AUTO: Tag all screenings at the venue during the festival window (exclusive venue)
 * - TITLE: Require title keyword, URL pattern, or other signal matching
 */
export type ConfidenceStrategy = "AUTO" | "TITLE";

/**
 * Per-festival configuration for the reverse-tagger and festival detector.
 * Defines how to identify screenings belonging to a given festival.
 */
export interface FestivalTaggingConfig {
  /** Festival slug pattern — the year is appended at runtime (e.g., "frightfest" → "frightfest-2026") */
  slugBase: string;
  /** Cinema slugs where this festival takes place */
  venues: string[];
  /** How to decide whether a screening belongs to this festival */
  confidence: ConfidenceStrategy;
  /**
   * Title keywords that signal a screening belongs to this festival.
   * Only used when confidence is "TITLE".
   * Matched case-insensitively against the screening's film title.
   */
  titleKeywords?: string[];
  /**
   * Regex patterns matched against booking URLs.
   * Only used when confidence is "TITLE".
   */
  urlPatterns?: RegExp[];
  /**
   * Month range (0-indexed) when this festival typically runs.
   * Used as a quick pre-filter before checking exact festival dates.
   */
  typicalMonths: number[];
}

/**
 * Result of a reverse-tagging run for a single festival.
 */
export interface TaggingResult {
  festivalSlug: string;
  festivalName: string;
  screeningsChecked: number;
  screeningsTagged: number;
  alreadyTagged: number;
}

/**
 * Result of the festival detector matching a screening.
 */
export interface FestivalMatch {
  festivalSlug: string;
  festivalSection?: string;
}

/**
 * Festival record from the database, narrowed to fields needed for tagging.
 */
export interface FestivalRecord {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  startDate: string;
  endDate: string;
  venues: string[] | null;
}

/**
 * Watchdog probe configuration for a festival website.
 */
export interface WatchdogProbe {
  /** Festival slug base (without year) */
  slugBase: string;
  /** URL to probe for programme availability */
  probeUrl: string | ((year: number) => string);
  /** CSS selector or content signal indicating programme is live */
  signal: "content-hash" | "page-exists" | "element-count";
  /** CSS selector for element-count signal */
  selector?: string;
  /** Minimum element count to consider programme live */
  minCount?: number;
}
