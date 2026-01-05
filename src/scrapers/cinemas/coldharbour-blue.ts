/**
 * Coldharbour Blue Cinema Scraper (Brixton/Loughborough Junction)
 *
 * Independent cinema specializing in new releases, art-house, classics and documentaries
 * Uses WordPress Events Calendar REST API - no browser needed
 *
 * Website: https://www.coldharbourblue.com
 * API: https://www.coldharbourblue.com/wp-json/tribe/events/v1/events
 */

import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";
import { parseUKLocalDateTime } from "../utils/date-parser";

// ============================================================================
// Coldharbour Blue Configuration
// ============================================================================

export const COLDHARBOUR_CONFIG: ScraperConfig = {
  cinemaId: "coldharbour-blue",
  baseUrl: "https://www.coldharbourblue.com",
  requestsPerMinute: 30,
  delayBetweenRequests: 500,
};

export const COLDHARBOUR_VENUE = {
  id: "coldharbour-blue",
  name: "Coldharbour Blue",
  shortName: "Coldharbour",
  area: "Loughborough Junction",
  postcode: "SE24 0HN",
  address: "259-260 Hardess Street",
  features: ["bar", "accessible", "community", "repertory"],
  website: "https://www.coldharbourblue.com",
};

// ============================================================================
// API Response Types (WordPress Events Calendar)
// ============================================================================

interface TribeCategory {
  name: string;
  slug: string;
  id: number;
}

interface TribeEvent {
  id: number;
  title: string;
  description: string;
  url: string;
  start_date: string; // "2026-01-06 20:00:00"
  end_date: string;
  start_date_details: {
    year: string;
    month: string;
    day: string;
    hour: string;
    minutes: string;
    seconds: string;
  };
  categories: TribeCategory[];
  image?: {
    url: string;
    sizes?: {
      large?: { url: string };
      medium?: { url: string };
    };
  };
  cost?: string;
}

interface TribeEventsResponse {
  events: TribeEvent[];
  total: number;
  total_pages: number;
}

// ============================================================================
// Coldharbour Blue Scraper Implementation
// ============================================================================

export class ColdharbourBlueScraper implements CinemaScraper {
  config = COLDHARBOUR_CONFIG;
  private apiUrl = "https://www.coldharbourblue.com/wp-json/tribe/events/v1/events";

  async scrape(): Promise<RawScreening[]> {
    console.log(`[coldharbour-blue] Fetching from WordPress Events Calendar API...`);

    try {
      const response = await fetch(`${this.apiUrl}?per_page=100`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Referer": "https://www.coldharbourblue.com/",
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data: TribeEventsResponse = await response.json();
      console.log(`[coldharbour-blue] API returned ${data.events.length} events`);

      const screenings = this.convertToRawScreenings(data.events);
      const validated = this.validate(screenings);

      console.log(`[coldharbour-blue] ${validated.length} valid screenings after filtering`);

      return validated;
    } catch (error) {
      console.error(`[coldharbour-blue] Scrape failed:`, error);
      throw error;
    }
  }

  private convertToRawScreenings(events: TribeEvent[]): RawScreening[] {
    return events
      .filter((event) => {
        // Only include events in the "Screenings" category
        const isScreening = event.categories.some(
          (cat) => cat.slug === "screenings" || cat.name.toLowerCase() === "screenings"
        );
        return isScreening;
      })
      .map((event) => {
        // Parse the datetime - format is "2026-01-06 20:00:00"
        // This is UK local time without timezone indicator
        // WordPress uses space separator, not T, so convert it
        const isoString = event.start_date.replace(" ", "T");
        const datetime = parseUKLocalDateTime(isoString);

        // Use the event URL as the booking URL (links to event detail page with ticket purchase)
        const bookingUrl = event.url;

        // Generate source ID for deduplication
        const sourceId = `coldharbour-${event.id}`;

        // Get poster URL if available
        const posterUrl = event.image?.sizes?.large?.url ||
                         event.image?.sizes?.medium?.url ||
                         event.image?.url;

        return {
          filmTitle: this.cleanTitle(event.title),
          datetime,
          bookingUrl,
          sourceId,
          posterUrl,
          // Format is always digital for this venue
          format: "digital",
        };
      });
  }

  /**
   * Clean the film title - remove any trailing numbers or redundant info
   * e.g., "Sister Midnight" stays as is, but "Mickey 17 3" becomes "Mickey 17"
   */
  private cleanTitle(title: string): string {
    // Strip HTML entities
    let cleaned = title
      .replace(/&#8217;/g, "'")
      .replace(/&#8211;/g, "-")
      .replace(/&amp;/g, "&")
      .replace(/<[^>]*>/g, "")
      .trim();

    // Remove trailing single digits that look like duplicate markers (e.g., "Mickey 17 3")
    // But preserve numbers that are part of the title (e.g., "Mickey 17")
    // Only remove if it's a single digit after a space at the very end
    cleaned = cleaned.replace(/\s+\d$/, "").trim();

    return cleaned;
  }

  private validate(screenings: RawScreening[]): RawScreening[] {
    const now = new Date();
    const seen = new Set<string>();

    return screenings.filter((s) => {
      // Skip invalid entries
      if (!s.filmTitle || s.filmTitle.trim() === "") return false;
      if (!s.datetime || isNaN(s.datetime.getTime())) return false;

      // Skip past screenings
      if (s.datetime < now) return false;

      // Deduplicate by film title + datetime (same film at same time)
      // This handles duplicate entries like "Sister Midnight" and "Sister Midnight 2"
      const dedupeKey = `${s.filmTitle.toLowerCase()}-${s.datetime.toISOString()}`;
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);

      return true;
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.apiUrl, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Factory function
export function createColdharbourBlueScraper(): ColdharbourBlueScraper {
  return new ColdharbourBlueScraper();
}
