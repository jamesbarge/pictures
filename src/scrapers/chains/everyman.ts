/**
 * Everyman Cinemas Scraper
 *
 * Uses Everyman's internal API (gatsby-source-boxofficeapi) for reliable data extraction.
 * Website: https://www.everymancinema.com
 *
 * API Endpoints:
 * - /api/gatsby-source-boxofficeapi/scheduledMovies?theaterId=X0712
 * - /api/gatsby-source-boxofficeapi/schedule?from=...&to=...&theaters=...
 * - /api/gatsby-source-boxofficeapi/movies?ids=...
 *
 * To add a new Everyman venue:
 * 1. Add venue config to EVERYMAN_VENUES array below
 * 2. Find the venue's theater ID from the website (format: X0712, G011I, etc.)
 */

import type { ChainConfig, VenueConfig, RawScreening, ChainScraper } from "../types";
import { addDays, format } from "date-fns";

// ============================================================================
// Everyman Venue Configurations - London Locations
// ============================================================================

// Theater IDs from Everyman's API (uppercase format)
const THEATER_IDS: Record<string, string> = {
  "baker-street": "X0712",
  "barnet": "X06SI",
  "belsize-park": "X077P",
  "borough-yards": "G011I",
  "broadgate": "X11NT",
  "canary-wharf": "X0VPB",
  "chelsea": "X078X",
  "crystal-palace": "X11DR",
  "hampstead": "X06ZW",
  "kings-cross": "X0X5P",
  "maida-vale": "X0LWI",
  "muswell-hill": "X06SN",
  "screen-on-the-green": "X077O",
  "stratford-international": "G029X",
  "walthamstow": "X0WT1",
};

export const EVERYMAN_VENUES: VenueConfig[] = [
  {
    id: "everyman-baker-street",
    name: "Everyman Baker Street",
    shortName: "Everyman Baker St",
    slug: "baker-street",
    area: "Marylebone",
    postcode: "W1U 6AG",
    address: "96-98 Baker Street",
    features: ["bar", "food"],
    active: true,
  },
  {
    id: "everyman-barnet",
    name: "Everyman Barnet",
    shortName: "Everyman Barnet",
    slug: "barnet",
    area: "Barnet",
    postcode: "EN5 5SJ",
    address: "Great North Road",
    features: ["bar"],
    active: true,
  },
  {
    id: "everyman-belsize-park",
    name: "Everyman Belsize Park",
    shortName: "Everyman Belsize",
    slug: "belsize-park",
    area: "Belsize Park",
    postcode: "NW3 4QG",
    address: "203 Haverstock Hill",
    features: ["historic", "bar"],
    active: true,
  },
  {
    id: "everyman-borough-yards",
    name: "Everyman Borough Yards",
    shortName: "Everyman Borough",
    slug: "borough-yards",
    area: "Borough",
    postcode: "SE1 9PH",
    address: "Borough Yards",
    features: ["bar", "food"],
    active: true,
  },
  {
    id: "everyman-broadgate",
    name: "Everyman Broadgate",
    shortName: "Everyman Broadgate",
    slug: "broadgate",
    area: "Liverpool Street",
    postcode: "EC2M 2QS",
    address: "Broadgate Circle",
    features: ["bar"],
    active: true,
  },
  {
    id: "everyman-canary-wharf",
    name: "Everyman Canary Wharf",
    shortName: "Everyman Canary",
    slug: "canary-wharf",
    area: "Canary Wharf",
    postcode: "E14 5NY",
    address: "Crossrail Place",
    features: ["bar", "food"],
    active: true,
  },
  {
    id: "everyman-chelsea",
    name: "Everyman Chelsea",
    shortName: "Everyman Chelsea",
    slug: "chelsea",
    area: "Chelsea",
    postcode: "SW3 3TD",
    address: "279 King's Road",
    features: ["bar"],
    active: true,
  },
  {
    id: "everyman-crystal-palace",
    name: "Everyman Crystal Palace",
    shortName: "Everyman Crystal",
    slug: "crystal-palace",
    area: "Crystal Palace",
    postcode: "SE19 2AE",
    address: "25 Church Road",
    features: ["bar"],
    active: true,
  },
  {
    id: "everyman-hampstead",
    name: "Everyman Hampstead",
    shortName: "Everyman Hampstead",
    slug: "hampstead",
    area: "Hampstead",
    postcode: "NW3 1QE",
    address: "5 Holly Bush Vale",
    features: ["historic", "bar"],
    active: true,
  },
  {
    id: "everyman-kings-cross",
    name: "Everyman King's Cross",
    shortName: "Everyman Kings X",
    slug: "kings-cross",
    area: "King's Cross",
    postcode: "N1C 4AG",
    address: "Coal Drops Yard",
    features: ["bar", "food"],
    active: true,
  },
  {
    id: "everyman-maida-vale",
    name: "Everyman Maida Vale",
    shortName: "Everyman Maida",
    slug: "maida-vale",
    area: "Maida Vale",
    postcode: "W9 1TT",
    address: "215 Sutherland Avenue",
    features: ["bar"],
    active: true,
  },
  {
    id: "everyman-muswell-hill",
    name: "Everyman Muswell Hill",
    shortName: "Everyman Muswell",
    slug: "muswell-hill",
    area: "Muswell Hill",
    postcode: "N10 3TD",
    address: "Fortis Green Road",
    features: ["bar"],
    active: true,
  },
  {
    id: "screen-on-the-green",
    name: "Screen on the Green",
    shortName: "Screen Green",
    slug: "screen-on-the-green",
    area: "Islington",
    postcode: "N1 0PH",
    address: "83 Upper Street",
    features: ["historic", "single_screen", "bar"],
    active: true,
  },
  {
    id: "everyman-stratford",
    name: "Everyman Stratford International",
    shortName: "Everyman Stratford",
    slug: "stratford-international",
    area: "Stratford",
    postcode: "E20 1GL",
    address: "International Way",
    features: ["bar"],
    active: true,
  },
  {
    id: "everyman-walthamstow",
    name: "Everyman Walthamstow",
    shortName: "Everyman Waltham",
    slug: "walthamstow",
    area: "Walthamstow",
    postcode: "E17 7JN",
    address: "186 Hoe Street",
    features: ["bar"],
    active: true,
  },
];

// ============================================================================
// Chain Configuration
// ============================================================================

export const EVERYMAN_CONFIG: ChainConfig = {
  chainId: "everyman",
  chainName: "Everyman",
  baseUrl: "https://www.everymancinema.com",
  venues: EVERYMAN_VENUES,
  requestsPerMinute: 10,
  delayBetweenRequests: 3000,
};

// ============================================================================
// API Types
// ============================================================================

interface ScheduledMoviesResponse {
  movieIds: {
    titleAsc: string[];
    releaseAsc: string[];
    releaseDesc: string[];
  };
  scheduledDays: Record<string, string[]>;
}

interface MovieInfo {
  id: string;
  title: string;
  originalTitle?: string;
  rating?: string;
}

interface ShowtimeData {
  id: string;
  startsAt: string;
  tags: string[];
  isExpired: boolean;
  data: {
    ticketing: Array<{
      urls: string[];
      type: string;
      provider: string;
    }>;
  };
}

interface ScheduleResponse {
  [theaterId: string]: {
    schedule: {
      [movieId: string]: {
        [date: string]: ShowtimeData[];
      };
    };
  };
}

// ============================================================================
// Everyman Scraper Implementation (API-based)
// ============================================================================

export class EverymanScraper implements ChainScraper {
  chainConfig = EVERYMAN_CONFIG;
  private movieCache = new Map<string, MovieInfo>();

  /**
   * Scrape all active venues
   */
  async scrapeAll(): Promise<Map<string, RawScreening[]>> {
    const activeVenues = this.chainConfig.venues.filter(v => v.active !== false);
    return this.scrapeVenues(activeVenues.map(v => v.id));
  }

  /**
   * Scrape specific venues by ID
   */
  async scrapeVenues(venueIds: string[]): Promise<Map<string, RawScreening[]>> {
    const results = new Map<string, RawScreening[]>();

    for (const venueId of venueIds) {
      const venue = this.chainConfig.venues.find(v => v.id === venueId);
      if (!venue) {
        console.warn(`[everyman] Unknown venue: ${venueId}`);
        continue;
      }

      console.log(`[everyman] Scraping ${venue.name}...`);

      try {
        const screenings = await this.scrapeVenue(venueId);
        results.set(venueId, screenings);
      } catch (error) {
        console.error(`[everyman] Error scraping ${venue.name}:`, error);
        results.set(venueId, []);
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, this.chainConfig.delayBetweenRequests));
    }

    return results;
  }

  /**
   * Scrape single venue using API
   */
  async scrapeVenue(venueId: string): Promise<RawScreening[]> {
    const venue = this.chainConfig.venues.find(v => v.id === venueId);
    if (!venue) {
      console.error(`[everyman] Venue not found: ${venueId}`);
      return [];
    }

    const theaterId = THEATER_IDS[venue.slug];
    if (!theaterId) {
      console.error(`[everyman] No theater ID for: ${venue.slug}`);
      return [];
    }

    try {
      // Step 1: Get scheduled movies for this venue
      const scheduledMovies = await this.fetchScheduledMovies(theaterId);
      if (!scheduledMovies || !scheduledMovies.movieIds.titleAsc.length) {
        console.log(`[everyman] ${venue.name}: No scheduled movies found`);
        return [];
      }

      const movieIds = scheduledMovies.movieIds.titleAsc;

      // Step 2: Fetch movie details
      await this.fetchMovieDetails(movieIds);

      // Step 3: Fetch schedule for the next 30 days
      const now = new Date();
      const fromDate = format(now, "yyyy-MM-dd'T'HH:mm:ss");
      const toDate = format(addDays(now, 30), "yyyy-MM-dd'T'23:59:59");

      const schedule = await this.fetchSchedule(theaterId, fromDate, toDate);
      if (!schedule || !schedule[theaterId]) {
        console.log(`[everyman] ${venue.name}: No schedule data found`);
        return [];
      }

      // Step 4: Transform schedule into screenings
      const screenings = this.transformSchedule(schedule[theaterId].schedule, venue);

      console.log(`[everyman] ${venue.name}: ${screenings.length} screenings`);
      return screenings;
    } catch (error) {
      console.error(`[everyman] Error scraping ${venue.name}:`, error);
      return [];
    }
  }

  private async fetchScheduledMovies(theaterId: string): Promise<ScheduledMoviesResponse | null> {
    try {
      const url = `${this.chainConfig.baseUrl}/api/gatsby-source-boxofficeapi/scheduledMovies?theaterId=${theaterId}`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        console.error(`[everyman] Failed to fetch scheduled movies: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error(`[everyman] Error fetching scheduled movies:`, error);
      return null;
    }
  }

  private async fetchMovieDetails(movieIds: string[]): Promise<void> {
    // Only fetch movies we don't have cached
    const uncachedIds = movieIds.filter(id => !this.movieCache.has(id));
    if (uncachedIds.length === 0) return;

    try {
      const params = uncachedIds.map(id => `ids=${id}`).join('&');
      const url = `${this.chainConfig.baseUrl}/api/gatsby-source-boxofficeapi/movies?basic=false&castingLimit=0&${params}`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        console.error(`[everyman] Failed to fetch movie details: ${response.status}`);
        return;
      }

      const movies = await response.json() as MovieInfo[];
      for (const movie of movies) {
        this.movieCache.set(movie.id, movie);
      }
    } catch (error) {
      console.error(`[everyman] Error fetching movie details:`, error);
    }
  }

  private async fetchSchedule(theaterId: string, fromDate: string, toDate: string): Promise<ScheduleResponse | null> {
    try {
      const theatersParam = encodeURIComponent(JSON.stringify({ id: theaterId, timeZone: "Europe/London" }));
      const url = `${this.chainConfig.baseUrl}/api/gatsby-source-boxofficeapi/schedule?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&theaters=${theatersParam}`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        console.error(`[everyman] Failed to fetch schedule: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error(`[everyman] Error fetching schedule:`, error);
      return null;
    }
  }

  private transformSchedule(
    schedule: Record<string, Record<string, ShowtimeData[]>>,
    venue: VenueConfig
  ): RawScreening[] {
    const screenings: RawScreening[] = [];
    const now = new Date();

    for (const [movieId, dateSchedule] of Object.entries(schedule)) {
      const movie = this.movieCache.get(movieId);
      const filmTitle = movie?.title || `Unknown Film (${movieId})`;

      for (const [date, showtimes] of Object.entries(dateSchedule)) {
        for (const showtime of showtimes) {
          if (showtime.isExpired) continue;

          const datetime = new Date(showtime.startsAt);
          if (datetime < now) continue;

          // Get booking URL (prefer DESKTOP provider)
          const ticketing = showtime.data?.ticketing?.find(t => t.type === 'DESKTOP' && t.provider === 'default');
          const bookingUrl = ticketing?.urls?.[0] || '';

          const sourceId = `everyman-${venue.id}-${showtime.id}`;

          screenings.push({
            filmTitle,
            datetime,
            bookingUrl,
            sourceId,
          });
        }
      }
    }

    return screenings;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.chainConfig.baseUrl}/api/gatsby-source-boxofficeapi/scheduledMovies?theaterId=X0712`,
        { method: "GET" }
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Factory function
export function createEverymanScraper(): EverymanScraper {
  return new EverymanScraper();
}

// Get active venues
export function getActiveEverymanVenues(): VenueConfig[] {
  return EVERYMAN_VENUES.filter(v => v.active !== false);
}
