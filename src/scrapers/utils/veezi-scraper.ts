/**
 * Generic Veezi Scraper
 *
 * Reusable scraper for cinemas using Veezi's public ticketing pages.
 * Parses JSON-LD structured data which is more reliable than HTML scraping.
 *
 * Veezi ticketing URLs follow the pattern:
 * https://ticketing.{region}.veezi.com/sessions/?siteToken={token}
 *
 * Regions: eu, us, useast, uswest, oz (Australia)
 *
 * The JSON-LD data includes:
 * - @type: "VisualArtsEvent"
 * - name: Film title
 * - startDate: ISO 8601 timestamp
 * - duration: ISO 8601 duration (e.g., "PT2H6M")
 * - url: Purchase URL with siteToken
 */

import * as cheerio from "cheerio";
import type { RawScreening } from "../types";

// ============================================================================
// Types
// ============================================================================

export interface VeeziVenueConfig {
  /** Unique venue ID for database */
  id: string;
  /** Display name */
  name: string;
  /** Veezi region: eu, us, useast, uswest, oz */
  region: "eu" | "us" | "useast" | "uswest" | "oz";
  /** Veezi site token (unique per cinema) */
  siteToken: string;
  /** London area (if applicable) */
  area?: string;
  /** Postal code */
  postcode?: string;
  /** Street address */
  address?: string;
}

interface VeeziJsonLdEvent {
  "@type": string;
  "@context": string;
  name: string;
  startDate: string;
  duration?: string;
  url?: string;
  location?: {
    "@type": string;
    name?: string;
    address?: string;
  };
}

// ============================================================================
// Veezi Scraper
// ============================================================================

export class VeeziScraper {
  private venue: VeeziVenueConfig;
  private delayMs: number;

  constructor(venue: VeeziVenueConfig, delayMs = 2000) {
    this.venue = venue;
    this.delayMs = delayMs;
  }

  /**
   * Build the Veezi ticketing URL for this venue
   */
  getTicketingUrl(): string {
    return `https://ticketing.${this.venue.region}.veezi.com/sessions/?siteToken=${this.venue.siteToken}`;
  }

  /**
   * Scrape all screenings from the Veezi ticketing page
   */
  async scrape(): Promise<RawScreening[]> {
    const url = this.getTicketingUrl();
    console.log(`[veezi:${this.venue.id}] Fetching ${url}`);

    const html = await this.fetchPage(url);
    const events = this.extractJsonLdEvents(html);

    console.log(`[veezi:${this.venue.id}] Found ${events.length} JSON-LD events`);

    const screenings = events
      .map((event) => this.eventToScreening(event))
      .filter((s): s is RawScreening => s !== null);

    const validated = this.validate(screenings);
    console.log(`[veezi:${this.venue.id}] ${validated.length} valid screenings`);

    return validated;
  }

  /**
   * Fetch the ticketing page HTML
   */
  private async fetchPage(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`[veezi:${this.venue.id}] HTTP ${response.status}: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Extract JSON-LD event data from HTML
   */
  private extractJsonLdEvents(html: string): VeeziJsonLdEvent[] {
    const $ = cheerio.load(html);
    const events: VeeziJsonLdEvent[] = [];

    // Find all JSON-LD script tags
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const content = $(el).html();
        if (!content) return;

        const data = JSON.parse(content);

        // Handle single event or array
        if (Array.isArray(data)) {
          for (const item of data) {
            if (this.isVeeziEvent(item)) {
              events.push(item);
            }
          }
        } else if (this.isVeeziEvent(data)) {
          events.push(data);
        }
      } catch (e) {
        // Skip invalid JSON
        console.warn(`[veezi:${this.venue.id}] Failed to parse JSON-LD:`, e);
      }
    });

    return events;
  }

  /**
   * Type guard for Veezi events
   */
  private isVeeziEvent(data: unknown): data is VeeziJsonLdEvent {
    if (!data || typeof data !== "object") return false;
    const obj = data as Record<string, unknown>;
    return (
      obj["@type"] === "VisualArtsEvent" &&
      typeof obj.name === "string" &&
      typeof obj.startDate === "string"
    );
  }

  /**
   * Convert JSON-LD event to RawScreening
   */
  private eventToScreening(event: VeeziJsonLdEvent): RawScreening | null {
    try {
      // Parse ISO 8601 datetime
      const datetime = new Date(event.startDate);
      if (isNaN(datetime.getTime())) {
        console.warn(`[veezi:${this.venue.id}] Invalid datetime: ${event.startDate}`);
        return null;
      }

      // Clean up film title
      const filmTitle = this.cleanTitle(event.name);
      if (!filmTitle) return null;

      // Get booking URL
      const bookingUrl = event.url || this.getTicketingUrl();

      // Generate source ID
      const sourceId = `veezi-${this.venue.id}-${filmTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}-${datetime.toISOString()}`;

      // Parse duration if available (ISO 8601 duration: PT2H6M)
      const format = this.extractFormat(event.name);

      return {
        filmTitle,
        datetime,
        bookingUrl,
        sourceId,
        format: format || undefined,
      };
    } catch (e) {
      console.warn(`[veezi:${this.venue.id}] Failed to parse event:`, e);
      return null;
    }
  }

  /**
   * Clean up film title
   */
  private cleanTitle(title: string): string {
    return title
      .replace(/\s*\(\d{4}\)\s*$/, "") // Remove year suffix
      .replace(/\s*-\s*(2D|3D|IMAX|4DX|Dolby)\s*$/i, "") // Remove format suffix
      .trim();
  }

  /**
   * Extract format from title or event data
   */
  private extractFormat(title: string): string | null {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("3d")) return "3D";
    if (lowerTitle.includes("imax")) return "IMAX";
    if (lowerTitle.includes("4dx")) return "4DX";
    if (lowerTitle.includes("dolby")) return "Dolby";
    return null;
  }

  /**
   * Validate screenings
   */
  private validate(screenings: RawScreening[]): RawScreening[] {
    const now = new Date();
    const seen = new Set<string>();

    return screenings.filter((s) => {
      // Must have title
      if (!s.filmTitle || s.filmTitle.trim() === "") return false;

      // Must have valid datetime
      if (!s.datetime || isNaN(s.datetime.getTime())) return false;

      // Must be in the future
      if (s.datetime < now) return false;

      // Check for suspicious times (before 10am)
      const hours = s.datetime.getHours();
      if (hours < 10) {
        console.warn(
          `[veezi:${this.venue.id}] Warning: suspicious time ${hours}:${s.datetime.getMinutes()} for ${s.filmTitle}`
        );
      }

      // Deduplicate
      if (s.sourceId && seen.has(s.sourceId)) return false;
      if (s.sourceId) seen.add(s.sourceId);

      return true;
    });
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.getTicketingUrl(), { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Known UK Veezi Cinemas
// ============================================================================

/**
 * UK cinemas discovered using Veezi's public ticketing pages.
 * Add new cinemas here as they're discovered.
 */
export const UK_VEEZI_CINEMAS: VeeziVenueConfig[] = [
  {
    id: "kino-rye",
    name: "Kino Rye",
    region: "eu",
    siteToken: "nrn0dm26e79wsmj1rj9yaesk6g",
    area: "Rye",
    postcode: "TN31 7LB",
    address: "Lion Street, Rye",
  },
  {
    id: "heckfield-place",
    name: "Heckfield Place",
    region: "eu",
    siteToken: "t9rspv9y7567v2tgj24pqqkveg",
    area: "Hampshire",
  },
  // Note: Peckhamplex uses Veezi backend but has custom website frontend
  // so it doesn't expose a public Veezi ticketing URL
];

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Veezi scraper for a known UK cinema
 */
export function createVeeziScraper(cinemaId: string): VeeziScraper | null {
  const venue = UK_VEEZI_CINEMAS.find((v) => v.id === cinemaId);
  if (!venue) {
    console.error(`[veezi] Unknown cinema ID: ${cinemaId}`);
    return null;
  }
  return new VeeziScraper(venue);
}

/**
 * Create a Veezi scraper from a custom config
 */
export function createVeeziScraperFromConfig(config: VeeziVenueConfig): VeeziScraper {
  return new VeeziScraper(config);
}

/**
 * Scrape all known UK Veezi cinemas
 */
export async function scrapeAllVeeziCinemas(): Promise<Map<string, RawScreening[]>> {
  const results = new Map<string, RawScreening[]>();

  for (const venue of UK_VEEZI_CINEMAS) {
    try {
      const scraper = new VeeziScraper(venue);
      const screenings = await scraper.scrape();
      results.set(venue.id, screenings);

      // Delay between venues
      await new Promise((r) => setTimeout(r, 2000));
    } catch (e) {
      console.error(`[veezi:${venue.id}] Scrape failed:`, e);
      results.set(venue.id, []);
    }
  }

  return results;
}
