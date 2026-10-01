/**
 * Scraper Types
 * Core types for cinema scrapers with support for chains and multi-venue setups
 */

// ============================================================================
// Raw Data Types
// ============================================================================

/** A single screening extracted from a cinema website before database insertion */
export interface RawScreening {
  filmTitle: string;
  datetime: Date;
  screen?: string;
  format?: string;
  bookingUrl: string;
  eventType?: string;
  eventDescription?: string;
  sourceId?: string;
  /** Poster URL extracted from cinema website (fallback source) */
  posterUrl?: string;
  /** Year of the film (if available from source) */
  year?: number;
  /** Director name (if available from source) */
  director?: string;
  /** Film runtime in minutes (if available from source) */
  runtime?: number;
  /** Slug of the festival this screening belongs to (e.g., "bfi-lff-2025") */
  festivalSlug?: string;
  /** Section within the festival (e.g., "Galas", "Competition") */
  festivalSection?: string;
  /** Ticket availability status from the booking system */
  availabilityStatus?: "available" | "low" | "sold_out" | "returns" | "unknown";
  /**
   * How datetime was derived. The validator's early-time and future-horizon
   * heuristics exist to catch text-parsing mistakes, so a provenance that
   * cannot make those mistakes relaxes them. Unset means "text".
   *
   * - `"iso"` — an ISO/API instant. Cannot carry an AM/PM error, and the
   *   source is an absolute timestamp, so BOTH heuristics relax: sub-10:00
   *   times are kept with a warning AND the future cap rises 90 → 180 days
   *   (long-lead event cinema at the chains).
   * - `"local-24h"` — a machine-readable LOCAL wall clock in an established
   *   24-hour format (e.g. BFI AudienceView's zero-padded `HH:MM` column).
   *   It cannot carry an AM/PM error either, so sub-10:00 times are kept with
   *   a warning — but it is not an absolute instant and says nothing about how
   *   far ahead the venue publishes, so the future cap stays at 90 days.
   * - `"text"` (or unset) — parsed from display text. Full strictness: a bare
   *   1-9 hour may really be PM, so early times are rejected.
   */
  timeSource?: "iso" | "text" | "local-24h";
}

// ============================================================================
// Scraper Configuration
// ============================================================================

/** Configuration for a single-venue cinema scraper */
export interface ScraperConfig {
  cinemaId: string;
  baseUrl: string;
  requestsPerMinute: number;
  delayBetweenRequests: number;
}

/** Output of a scraper run: screenings collected plus metadata about the run */
export interface ScraperResult {
  cinemaId: string;
  screenings: RawScreening[];
  scrapedAt: Date;
  success: boolean;
  error?: string;
}

/** Contract for a single-venue cinema scraper implementation */
export interface CinemaScraper {
  config: ScraperConfig;
  scrape(): Promise<RawScreening[]>;
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// Chain/Multi-Venue Architecture
// ============================================================================

/**
 * Venue definition for chain cinemas (Curzon, Picturehouse, Everyman, etc.)
 * Each chain can have multiple venues with unique IDs and configurations
 */
export interface VenueConfig {
  /** Unique ID for this venue (used in database) */
  id: string;
  /** Display name */
  name: string;
  /** Short name for UI badges */
  shortName: string;
  /** Venue-specific URL or path */
  slug: string;
  /** London area/neighborhood */
  area: string;
  /** Postal code */
  postcode?: string;
  /** Street address */
  address?: string;
  /** Chain's internal venue ID (for API calls) */
  chainVenueId?: string;
  /** Features like IMAX, Dolby, 35mm, etc. */
  features?: string[];
  /** Whether venue is currently active */
  active?: boolean;
}

/**
 * Chain definition with all venues
 */
export interface ChainConfig {
  /** Chain ID (e.g., "curzon", "picturehouse") */
  chainId: string;
  /** Chain display name */
  chainName: string;
  /** Base URL for the chain's website */
  baseUrl: string;
  /** API endpoint if available */
  apiUrl?: string;
  /** All venues in this chain */
  venues: VenueConfig[];
  /** Rate limiting */
  requestsPerMinute: number;
  delayBetweenRequests: number;
}

/**
 * Base interface for chain scrapers that handle multiple venues
 */
export interface ChainScraper {
  chainConfig: ChainConfig;
  /** Per-venue failures from the latest multi-venue scrape. */
  venueErrors?: Map<string, string>;
  /** Scrape all active venues */
  scrapeAll(): Promise<Map<string, RawScreening[]>>;
  /** Scrape specific venues */
  scrapeVenues(venueIds: string[]): Promise<Map<string, RawScreening[]>>;
  /** Scrape single venue */
  scrapeVenue(venueId: string): Promise<RawScreening[]>;
  /** Health check */
  healthCheck(): Promise<boolean>;
}

/**
 * Suffix appended to every anti-bot-challenge rejection, and the only place this
 * string is produced. Same discriminator pattern as DB_TIMEOUT_MARKER in
 * src/db/index.ts: a message ending in it is always a venue-side WAF mitigation,
 * never a scraper fault and never an infrastructure problem.
 *
 * Such a block clears on the venue's own schedule, so the correct response is to
 * re-attempt the venue later rather than harder. `isChallengeError` in
 * runner-factory.ts is the sole reader; scrape-all.ts uses it to queue a deferred
 * retry. Deliberately NOT matched by `isConnectionError`: a challenge must not
 * count toward the run circuit breaker, which exists for wedged DB connections
 * and would otherwise skip every remaining scraper because one venue's WAF
 * happened to be in a block.
 *
 * It lives here rather than in runner-factory so a scraper can throw it without
 * importing the pipeline and db that runner-factory pulls in.
 */
export const SCRAPER_CHALLENGE_MARKER = "(anti-bot challenge)";
