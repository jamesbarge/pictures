/**
 * The Nickel Cinema Scraper (v2 - extends BaseScraper)
 *
 * 37-seat micro-cinema specializing in cult/grindhouse films
 * Uses their public JSON API for clean, structured data
 *
 * Website: https://thenickel.co.uk
 * API: https://thenickel.co.uk/api/screenings/upcoming
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { parseUKLocalDateTime } from "../utils/date-parser";

// API Response Types
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

export class NickelScraperV2 extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "the-nickel",
    baseUrl: "https://thenickel.co.uk",
    requestsPerMinute: 30,
    delayBetweenRequests: 500,
  };

  private apiUrl = "https://thenickel.co.uk/api/screenings/upcoming";

  protected async fetchPages(): Promise<string[]> {
    console.log("[the-nickel] Fetching from API...");
    const json = await this.fetchUrl(`${this.apiUrl}?limit=100`);
    return [json];
  }

  protected async parsePages(jsonPages: string[]): Promise<RawScreening[]> {
    const data: NickelScreening[] = JSON.parse(jsonPages[0]);
    console.log(`[the-nickel] API returned ${data.length} screenings`);

    return data.map((item) => {
      // Parse the ISO datetime string as UK local time
      const datetime = parseUKLocalDateTime(item.screeningDate);

      // Generate booking URL from screening ID
      const bookingUrl = `https://book.thenickel.co.uk/screening/${item.id}`;

      // Generate source ID for deduplication
      const sourceId = `nickel-${item.id}`;

      const format = item.format?.toLowerCase() || "digital";

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

  // Skip mystery movies/special events without real titles. The base already dedupes by sourceId.
  protected validate(screenings: RawScreening[]): RawScreening[] {
    return super.validate(screenings).filter((s) => s.filmTitle !== "MYSTERY MOVIE");
  }
}

/** Create and return a new Nickel (v2) scraper instance. */
export function createNickelScraperV2(): NickelScraperV2 {
  return new NickelScraperV2();
}
