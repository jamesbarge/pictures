/**
 * The Nickel Cinema Scraper (Clerkenwell)
 *
 * 37-seat micro-cinema specializing in cult/grindhouse films
 * Uses their public API for clean, structured data
 *
 * Website: https://thenickel.co.uk
 * API: https://thenickel.co.uk/api/screenings/upcoming
 */

import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";
import { parseUKLocalDateTime } from "../utils/date-parser";

// ============================================================================
// The Nickel Configuration
// ============================================================================

export const NICKEL_CONFIG: ScraperConfig = {
  cinemaId: "the-nickel",
  baseUrl: "https://thenickel.co.uk",
  requestsPerMinute: 30,
  delayBetweenRequests: 500,
};

export const NICKEL_VENUE = {
  id: "the-nickel",
  name: "The Nickel",
  shortName: "The Nickel",
  area: "Clerkenwell",
  postcode: "EC1R 5BY",
  address: "117-119 Clerkenwell Road",
  features: ["independent", "cult", "grindhouse", "16mm", "vhs", "bar", "repertory"],
  website: "https://thenickel.co.uk",
};

// ============================================================================
// API Response Types
// ============================================================================

interface NickelFilm {
  id: number;
  title: string;
  description: string | null;
  runtime: number | null;
  year: number | null;
  country: string | null;
  director: string | null;
  imageUrl: string | null;
}

interface NickelScreening {
  id: number;
  filmId: number;
  screeningDate: string; // ISO datetime e.g., "2025-12-27T20:30"
  doorsTime: string;
  filmTime: string;
  capacity: number;
  ticketsSold: number;
  price: number; // In pence
  format: string;
  film: NickelFilm;
}

// ============================================================================
// The Nickel Scraper Implementation
// ============================================================================

export class NickelScraper implements CinemaScraper {
  config = NICKEL_CONFIG;
  private apiUrl = "https://thenickel.co.uk/api/screenings/upcoming";

  async scrape(): Promise<RawScreening[]> {
    console.log(`[the-nickel] Fetching from API...`);

    try {
      const response = await fetch(`${this.apiUrl}?limit=100`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Referer": "https://thenickel.co.uk/",
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data: NickelScreening[] = await response.json();
      console.log(`[the-nickel] API returned ${data.length} screenings`);

      const screenings = this.convertToRawScreenings(data);
      const validated = this.validate(screenings);

      console.log(`[the-nickel] ${validated.length} valid screenings after filtering`);

      return validated;
    } catch (error) {
      console.error(`[the-nickel] Scrape failed:`, error);
      throw error;
    }
  }

  private convertToRawScreenings(data: NickelScreening[]): RawScreening[] {
    return data.map((item) => {
      // Parse the ISO datetime string as UK local time
      // API returns "2025-12-27T20:30" without timezone indicator
      const datetime = parseUKLocalDateTime(item.screeningDate);

      // Generate booking URL from screening ID
      const bookingUrl = `https://book.thenickel.co.uk/screening/${item.id}`;

      // Generate source ID for deduplication
      const sourceId = `nickel-${item.id}`;

      // Normalize format
      const format = item.format?.toLowerCase() === "digital" ? "digital" :
                     item.format?.toLowerCase() === "35mm" ? "35mm" :
                     item.format?.toLowerCase() === "16mm" ? "16mm" :
                     item.format?.toLowerCase() || "digital";

      return {
        filmTitle: item.film.title,
        datetime,
        format,
        bookingUrl,
        sourceId,
        year: item.film.year ?? undefined,
        director: item.film.director ?? undefined,
        posterUrl: item.film.imageUrl ?? undefined,
      };
    });
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

      // Skip mystery movies/special events without real titles
      if (s.filmTitle === "MYSTERY MOVIE") return false;

      // Deduplicate by sourceId
      if (s.sourceId && seen.has(s.sourceId)) return false;
      if (s.sourceId) seen.add(s.sourceId);

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
export function createNickelScraper(): NickelScraper {
  return new NickelScraper();
}
