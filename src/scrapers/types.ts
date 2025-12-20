/**
 * Scraper Types
 * Core types for cinema scrapers with support for chains and multi-venue setups
 */

// ============================================================================
// Raw Data Types
// ============================================================================

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
}

// ============================================================================
// Scraper Configuration
// ============================================================================

export interface ScraperConfig {
  cinemaId: string;
  baseUrl: string;
  requestsPerMinute: number;
  delayBetweenRequests: number;
}

export interface ScraperResult {
  cinemaId: string;
  screenings: RawScreening[];
  scrapedAt: Date;
  success: boolean;
  error?: string;
}

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
  /** Scrape all active venues */
  scrapeAll(): Promise<Map<string, RawScreening[]>>;
  /** Scrape specific venues */
  scrapeVenues(venueIds: string[]): Promise<Map<string, RawScreening[]>>;
  /** Scrape single venue */
  scrapeVenue(venueId: string): Promise<RawScreening[]>;
  /** Health check */
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// Common Booking System Support
// ============================================================================

/**
 * Many UK cinemas use common booking systems like Vista, Veezi, or Spectrix
 * This allows us to potentially share scraping logic
 */
export type BookingSystem =
  | "vista"          // Vista (used by many chains)
  | "veezi"          // Veezi
  | "spectrix"       // Spectrix (arts venues)
  | "ticketsolve"    // Ticketsolve
  | "custom"         // Custom/proprietary
  | "unknown";

export interface BookingSystemConfig {
  system: BookingSystem;
  /** API endpoint if discoverable */
  apiEndpoint?: string;
  /** Whether site uses Cloudflare protection */
  hasCloudflare?: boolean;
}
