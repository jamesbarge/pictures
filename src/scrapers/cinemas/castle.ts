/**
 * Castle Cinema Scraper (Hackney)
 *
 * Community cinema in Homerton with 82-seat main screen + 27-seat second screen.
 * Uses JSON-LD structured data (Schema.org ScreeningEvent) embedded in homepage.
 * Uses Admit One for booking.
 *
 * Website: https://thecastlecinema.com
 * Booking: https://castlecinema.admit-one.co.uk
 */

import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";

// ============================================================================
// Castle Cinema Configuration
// ============================================================================

export const CASTLE_CONFIG: ScraperConfig = {
  cinemaId: "castle",
  baseUrl: "https://thecastlecinema.com",
  requestsPerMinute: 30,
  delayBetweenRequests: 500,
};

export const CASTLE_VENUE = {
  id: "castle",
  name: "The Castle Cinema",
  shortName: "Castle",
  area: "Hackney",
  postcode: "E9 6DA",
  address: "First floor, 64-66 Brooksby's Walk",
  features: ["independent", "community", "arthouse", "bar", "restaurant"],
  website: "https://thecastlecinema.com",
};

// ============================================================================
// JSON-LD Types (Schema.org ScreeningEvent)
// ============================================================================

interface SchemaOrgMovie {
  "@type": "Movie";
  name: string;
  url: string;
}

interface SchemaOrgScreeningEvent {
  "@context": string;
  "@type": "ScreeningEvent";
  "@id": string;
  name: string;
  description: string;
  url: string;
  doorTime: string;  // ISO datetime
  startDate: string; // ISO datetime
  duration: string;  // ISO duration e.g., "PT133M"
  workPresented: SchemaOrgMovie;
}

// ============================================================================
// Castle Cinema Scraper Implementation
// ============================================================================

export class CastleScraper implements CinemaScraper {
  config = CASTLE_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log("[castle-cinema] Fetching homepage for JSON-LD data...");

    try {
      const response = await fetch(this.config.baseUrl, {
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept-Language": "en-GB,en;q=0.9",
        },
      });

      if (!response.ok) {
        throw new Error("HTTP " + response.status + ": " + response.statusText);
      }

      const html = await response.text();
      const jsonLdBlocks = this.extractJsonLd(html);

      console.log("[castle-cinema] Found " + jsonLdBlocks.length + " JSON-LD blocks");

      const screeningEvents = this.filterScreeningEvents(jsonLdBlocks);
      console.log("[castle-cinema] Found " + screeningEvents.length + " ScreeningEvent entries");

      const screenings = this.convertToRawScreenings(screeningEvents);
      const validated = this.validate(screenings);

      console.log("[castle-cinema] " + validated.length + " valid screenings after filtering");

      return validated;
    } catch (error) {
      console.error("[castle-cinema] Scrape failed:", error);
      throw error;
    }
  }

  /**
   * Extract all JSON-LD script blocks from HTML
   */
  private extractJsonLd(html: string): unknown[] {
    const pattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    const blocks: unknown[] = [];

    let match;
    while ((match = pattern.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        blocks.push(data);
      } catch {
        // Skip invalid JSON blocks
      }
    }

    return blocks;
  }

  /**
   * Filter for ScreeningEvent type blocks
   */
  private filterScreeningEvents(blocks: unknown[]): SchemaOrgScreeningEvent[] {
    return blocks.filter((block): block is SchemaOrgScreeningEvent => {
      return (
        typeof block === "object" &&
        block !== null &&
        "@type" in block &&
        (block as { "@type": string })["@type"] === "ScreeningEvent"
      );
    });
  }

  /**
   * Convert Schema.org ScreeningEvent to RawScreening
   */
  private convertToRawScreenings(events: SchemaOrgScreeningEvent[]): RawScreening[] {
    return events.map((event) => {
      // Parse ISO datetime - format: "2025-12-29T20:45:00"
      const datetime = new Date(event.startDate);

      // Extract booking ID from URL for sourceId
      // URL format: https://thecastlecinema.com/bookings/15454/
      const bookingIdMatch = event.url.match(/\/bookings\/(\d+)\//);
      const bookingId = bookingIdMatch ? bookingIdMatch[1] : null;
      const sourceId = bookingId ? "castle-" + bookingId : undefined;

      // Parse duration (ISO 8601 format, e.g., "PT133M" = 133 minutes)
      const durationMatch = event.duration?.match(/PT(\d+)M/);
      const durationMinutes = durationMatch ? parseInt(durationMatch[1], 10) : undefined;

      return {
        filmTitle: event.workPresented?.name || event.name,
        datetime,
        bookingUrl: event.url,
        sourceId,
        // Could add duration to eventDescription if useful
        eventDescription: durationMinutes ? "Runtime: " + durationMinutes + " mins" : undefined,
      };
    });
  }

  /**
   * Validate and filter screenings
   */
  private validate(screenings: RawScreening[]): RawScreening[] {
    const now = new Date();
    const seen = new Set<string>();

    return screenings.filter((s) => {
      // Skip invalid entries
      if (!s.filmTitle || s.filmTitle.trim() === "") return false;
      if (!s.datetime || isNaN(s.datetime.getTime())) return false;
      if (!s.bookingUrl || s.bookingUrl.trim() === "") return false;

      // Skip past screenings
      if (s.datetime < now) return false;

      // Deduplicate by sourceId
      if (s.sourceId && seen.has(s.sourceId)) return false;
      if (s.sourceId) seen.add(s.sourceId);

      return true;
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.config.baseUrl, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Factory function
export function createCastleScraper(): CastleScraper {
  return new CastleScraper();
}
