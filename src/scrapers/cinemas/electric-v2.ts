/**
 * Electric Cinema Scraper (v2 - extends BaseScraper)
 *
 * Luxury cinema chain with two London locations
 * Website: https://www.electriccinema.co.uk
 *
 * Uses their public JSON API for clean, structured data
 * API: https://electriccinema.co.uk/data/data.json
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";

// Re-export config and venue for compatibility
export { ELECTRIC_CONFIG, ELECTRIC_VENUES } from "./electric";

// API Response Types
interface ElectricFilm {
  vistaId: string;
  title: string;
  image: string;
  link: string;
  rating: string;
  short_synopsis: string;
  premiere: string;
  director: string;
  screeningCinemas: number[];
  screeningTypes: string[];
  screenings: {
    byCinema: Record<string, Record<string, number[]>>;
    byDateCinemaTime: Record<string, Record<string, number[]>>;
  };
  cinemas: Record<string, number>;
}

interface ElectricScreening {
  id: number;
  film: number;
  d: string; // Date: YYYY-MM-DD
  t: string; // Time: HH:MM
  cinema: number;
  st: string; // Screening type
  sn: string; // Screening number
  r: string; // Remaining seats
  bookable: boolean;
  link: string | false;
  message: string;
  a?: string[]; // Attributes (e.g., ["Kids Club"])
}

interface ElectricApiResponse {
  cinemas: Record<string, unknown>;
  films: Record<string, ElectricFilm>;
  screenings: Record<string, ElectricScreening>;
  screeningsByDate: Record<string, number[]>;
  filmOrder: Record<string, number[]>;
  screeningTypes: Record<
    string,
    {
      title: string;
      color: string;
      confirm: string;
    }
  >;
  isMember: boolean;
  attributeNotes: unknown[];
}

export class ElectricScraperV2 extends BaseScraper {
  config: ScraperConfig;

  private apiUrl = "https://electriccinema.co.uk/data/data.json";

  // Target venue ID to filter screenings (if null, returns all)
  private targetVenueId: string | null;

  // Map API cinema IDs to our venue IDs
  private cinemaIdMap: Record<string, string> = {
    "603": "electric-portobello",
    "602": "electric-white-city",
  };

  // Reverse map: venue ID to API cinema ID
  private venueIdToApiId: Record<string, string> = {
    "electric-portobello": "603",
    "electric-white-city": "602",
  };

  constructor(venueId?: string) {
    super();
    this.targetVenueId = venueId || null;
    this.config = {
      cinemaId: venueId || "electric",
      baseUrl: "https://www.electriccinema.co.uk",
      requestsPerMinute: 60,
      delayBetweenRequests: 100,
    };
  }

  protected async fetchPages(): Promise<string[]> {
    console.log("[electric] Fetching from API...");
    const json = await this.fetchUrl(this.apiUrl);
    return [json];
  }

  protected async parsePages(jsonPages: string[]): Promise<RawScreening[]> {
    const data: ElectricApiResponse = JSON.parse(jsonPages[0]);

    const screeningCount = Object.keys(data.screenings).length;
    const filmCount = Object.keys(data.films).length;
    console.log(`[electric] API returned ${screeningCount} screenings for ${filmCount} films`);

    return this.convertToRawScreenings(data);
  }

  private convertToRawScreenings(data: ElectricApiResponse): RawScreening[] {
    const screenings: RawScreening[] = [];

    for (const [screeningId, screening] of Object.entries(data.screenings)) {
      // Get venue ID from cinema ID
      const venueId = this.cinemaIdMap[String(screening.cinema)];
      if (!venueId) continue;

      // Filter by target venue if specified
      if (this.targetVenueId && venueId !== this.targetVenueId) continue;

      // Get film data
      const film = data.films[String(screening.film)];
      if (!film) {
        console.warn(`[electric] Film not found for screening ${screeningId}`);
        continue;
      }

      // Parse date and time
      const datetime = this.parseDateTime(screening.d, screening.t);
      if (!datetime) {
        console.warn(`[electric] Invalid datetime: ${screening.d} ${screening.t}`);
        continue;
      }

      // Build booking URL
      const bookingUrl = screening.link
        ? `${this.config.baseUrl}${screening.link}`
        : `${this.config.baseUrl}/programme/`;

      // Get screening type info
      const screeningType = data.screeningTypes[screening.st];
      let eventDescription: string | undefined;

      if (screening.a && screening.a.length > 0) {
        eventDescription = screening.a.join(", ");
      } else if (screeningType && screeningType.title !== "Main Feature") {
        eventDescription = screeningType.title;
      }

      screenings.push({
        filmTitle: film.title,
        datetime,
        bookingUrl,
        sourceId: `electric-${screeningId}`,
        year: film.premiere ? parseInt(film.premiere.substring(0, 4)) : undefined,
        director: film.director || undefined,
        posterUrl: film.image ? `${this.config.baseUrl}${film.image}` : undefined,
        eventDescription,
      });
    }

    return screenings;
  }

  private parseDateTime(dateStr: string, timeStr: string): Date | null {
    const [year, month, day] = dateStr.split("-").map(Number);
    const [hours, minutes] = timeStr.split(":").map(Number);

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
      return null;
    }

    const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return isNaN(date.getTime()) ? null : date;
  }

  protected validate(screenings: RawScreening[]): RawScreening[] {
    const baseValidated = super.validate(screenings);
    const seen = new Set<string>();

    return baseValidated.filter((s) => {
      if (s.sourceId && seen.has(s.sourceId)) return false;
      if (s.sourceId) seen.add(s.sourceId);
      return true;
    });
  }
}

export function createElectricScraperV2(venueId?: string): ElectricScraperV2 {
  return new ElectricScraperV2(venueId);
}
