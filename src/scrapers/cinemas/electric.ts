/**
 * Electric Cinema Scraper
 *
 * Luxury cinema chain with two London locations
 * Website: https://www.electriccinema.co.uk
 *
 * Uses their public JSON API for clean, structured data
 * API: https://electriccinema.co.uk/data/data.json
 */

import type { RawScreening, ScraperConfig, CinemaScraper, VenueConfig } from "../types";

// ============================================================================
// Electric Cinema Configuration
// ============================================================================

export const ELECTRIC_VENUES: VenueConfig[] = [
  {
    id: "electric-portobello",
    name: "Electric Cinema Portobello",
    shortName: "Electric Portobello",
    slug: "portobello",
    area: "Notting Hill",
    postcode: "W11 2ED",
    address: "191 Portobello Road",
    chainVenueId: "603", // API cinema ID
    features: ["luxury", "historic", "bar", "beds"],
    active: true,
  },
  {
    id: "electric-white-city",
    name: "Electric Cinema White City",
    shortName: "Electric White City",
    slug: "white-city",
    area: "White City",
    postcode: "W12 7SL",
    address: "Television Centre",
    chainVenueId: "602", // API cinema ID
    features: ["luxury", "bar", "beds"],
    active: true,
  },
];

export const ELECTRIC_CONFIG: ScraperConfig = {
  cinemaId: "electric",
  baseUrl: "https://www.electriccinema.co.uk",
  requestsPerMinute: 60, // API is fast, no need for rate limiting
  delayBetweenRequests: 100,
};

// ============================================================================
// API Response Types
// ============================================================================

interface ElectricCinema {
  id: number;
  vistaId: string;
  title: string;
  address: string;
  image: boolean;
  link: string;
  url: string;
  areas: Record<string, {
    id: string;
    label: string;
    isSofa: boolean;
  }>;
  home: boolean;
}

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
  cinemas: Record<string, ElectricCinema>;
  films: Record<string, ElectricFilm>;
  screenings: Record<string, ElectricScreening>;
  screeningsByDate: Record<string, number[]>;
  filmOrder: Record<string, number[]>;
  screeningTypes: Record<string, {
    title: string;
    color: string;
    confirm: string;
  }>;
  isMember: boolean;
  attributeNotes: unknown[];
}

// ============================================================================
// Electric Cinema Scraper Implementation
// ============================================================================

export class ElectricScraper implements CinemaScraper {
  config = ELECTRIC_CONFIG;
  private apiUrl = "https://electriccinema.co.uk/data/data.json";

  // Map API cinema IDs to our venue IDs
  private cinemaIdMap: Record<string, string> = {
    "603": "electric-portobello",
    "602": "electric-white-city",
  };

  async scrape(): Promise<RawScreening[]> {
    console.log(`[electric] Fetching from API...`);

    try {
      const response = await fetch(this.apiUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Referer": "https://www.electriccinema.co.uk/",
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data: ElectricApiResponse = await response.json();

      // Count screenings and films
      const screeningCount = Object.keys(data.screenings).length;
      const filmCount = Object.keys(data.films).length;
      console.log(`[electric] API returned ${screeningCount} screenings for ${filmCount} films`);

      const screenings = this.convertToRawScreenings(data);
      const validated = this.validate(screenings);

      console.log(`[electric] ${validated.length} valid screenings after filtering`);

      return validated;
    } catch (error) {
      console.error(`[electric] Scrape failed:`, error);
      throw error;
    }
  }

  private convertToRawScreenings(data: ElectricApiResponse): RawScreening[] {
    const screenings: RawScreening[] = [];

    for (const [screeningId, screening] of Object.entries(data.screenings)) {
      // Get venue ID from cinema ID
      const venueId = this.cinemaIdMap[String(screening.cinema)];
      if (!venueId) {
        // Skip screenings from unknown cinemas
        continue;
      }

      // Get film data
      const film = data.films[String(screening.film)];
      if (!film) {
        console.warn(`[electric] Film not found for screening ${screeningId}`);
        continue;
      }

      // Parse date and time
      // API returns d: "YYYY-MM-DD" and t: "HH:MM"
      const datetime = this.parseDateTime(screening.d, screening.t);
      if (!datetime) {
        console.warn(`[electric] Invalid datetime for screening ${screeningId}: ${screening.d} ${screening.t}`);
        continue;
      }

      // Build booking URL
      const bookingUrl = screening.link
        ? `${this.config.baseUrl}${screening.link}`
        : `${this.config.baseUrl}/programme/`;

      // Build source ID for deduplication
      const sourceId = `electric-${screeningId}`;

      // Get screening type info
      const screeningType = data.screeningTypes[screening.st];
      let eventDescription: string | undefined;

      // Check for special attributes
      if (screening.a && screening.a.length > 0) {
        eventDescription = screening.a.join(", ");
      } else if (screeningType && screeningType.title !== "Main Feature") {
        eventDescription = screeningType.title;
      }

      screenings.push({
        filmTitle: film.title,
        datetime,
        bookingUrl,
        sourceId,
        year: film.premiere ? parseInt(film.premiere.substring(0, 4)) : undefined,
        director: film.director || undefined,
        posterUrl: film.image ? `${this.config.baseUrl}${film.image}` : undefined,
        eventDescription,
      });
    }

    return screenings;
  }

  private parseDateTime(dateStr: string, timeStr: string): Date | null {
    try {
      // dateStr: "YYYY-MM-DD"
      // timeStr: "HH:MM"
      const [year, month, day] = dateStr.split("-").map(Number);
      const [hours, minutes] = timeStr.split(":").map(Number);

      if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
        return null;
      }

      // Create date in local time (UK timezone)
      const date = new Date(year, month - 1, day, hours, minutes, 0, 0);

      // Validate the date
      if (isNaN(date.getTime())) {
        return null;
      }

      return date;
    } catch {
      return null;
    }
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
export function createElectricScraper(): ElectricScraper {
  return new ElectricScraper();
}
