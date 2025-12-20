/**
 * Curzon Cinemas Scraper
 * Uses Vista Web Client API for showtime data
 *
 * API: https://vwc.curzon.com/WSVistaWebClient
 *
 * To add a new Curzon venue:
 * 1. Add venue config to CURZON_VENUES array below
 * 2. Find the venue's cinema ID from the Curzon website network requests
 */

import type { ChainConfig, VenueConfig, RawScreening, ChainScraper } from "../types";

// ============================================================================
// Curzon Venue Configurations
// Add new venues here - just need the slug, name, and chainVenueId
// ============================================================================

export const CURZON_VENUES: VenueConfig[] = [
  {
    id: "curzon-soho",
    name: "Curzon Soho",
    shortName: "Curzon Soho",
    slug: "soho",
    area: "Soho",
    postcode: "W1D 3DG",
    address: "99 Shaftesbury Avenue",
    chainVenueId: "0000000002", // Vista cinema ID
    features: ["bar", "cafe"],
    active: true,
  },
  {
    id: "curzon-mayfair",
    name: "Curzon Mayfair",
    shortName: "Curzon Mayfair",
    slug: "mayfair",
    area: "Mayfair",
    postcode: "W1J 7SH",
    address: "38 Curzon Street",
    chainVenueId: "0000000001", // Vista cinema ID
    features: ["historic", "single_screen"],
    active: true,
  },
  // -------------------------------------------------------------------------
  // Add more Curzon venues below (inactive by default until tested)
  // -------------------------------------------------------------------------
  {
    id: "curzon-bloomsbury",
    name: "Curzon Bloomsbury",
    shortName: "Curzon Blooms",
    slug: "bloomsbury",
    area: "Bloomsbury",
    postcode: "WC1H 8AG",
    address: "The Brunswick Centre",
    chainVenueId: "0000000003",
    features: ["bar"],
    active: true,
  },
  {
    id: "curzon-aldgate",
    name: "Curzon Aldgate",
    shortName: "Curzon Aldgate",
    slug: "aldgate",
    area: "Aldgate",
    postcode: "E1 8FA",
    address: "2 Whitechapel High Street",
    chainVenueId: "0000000006",
    features: ["bar", "rooftop"],
    active: true,
  },
  {
    id: "curzon-victoria",
    name: "Curzon Victoria",
    shortName: "Curzon Vic",
    slug: "victoria",
    area: "Victoria",
    postcode: "SW1E 5JA",
    address: "58 Victoria Street",
    chainVenueId: "0000000004",
    features: ["bar"],
    active: true,
  },
  {
    id: "curzon-hoxton",
    name: "Curzon Hoxton",
    shortName: "Curzon Hoxton",
    slug: "hoxton",
    area: "Hoxton",
    postcode: "N1 6NU",
    address: "58 Pitfield Street",
    chainVenueId: "0000000007",
    features: ["bar"],
    active: true,
  },
  {
    id: "curzon-kingston",
    name: "Curzon Kingston",
    shortName: "Curzon Kingston",
    slug: "kingston",
    area: "Kingston",
    postcode: "KT1 1QP",
    address: "Charter Quay",
    chainVenueId: "0000000009",
    active: true,
  },
  {
    id: "curzon-richmond",
    name: "Curzon Richmond",
    shortName: "Curzon Richmond",
    slug: "richmond",
    area: "Richmond",
    postcode: "TW9 1NE",
    address: "3 Water Lane",
    chainVenueId: "0000000005",
    active: true,
  },
  {
    id: "curzon-wimbledon",
    name: "Curzon Wimbledon",
    shortName: "Curzon Wimbledon",
    slug: "wimbledon",
    area: "Wimbledon",
    postcode: "SW19 8YA",
    address: "23 The Broadway",
    chainVenueId: "0000000008",
    active: true,
  },
  {
    id: "curzon-camden",
    name: "Curzon Camden",
    shortName: "Curzon Camden",
    slug: "camden",
    area: "Camden",
    postcode: "NW1 8QP",
    address: "Hawley Wharf",
    chainVenueId: "0000000010",
    active: true,
  },
];

// ============================================================================
// Chain Configuration
// ============================================================================

export const CURZON_CONFIG: ChainConfig = {
  chainId: "curzon",
  chainName: "Curzon",
  baseUrl: "https://www.curzon.com",
  apiUrl: "https://vwc.curzon.com/WSVistaWebClient",
  venues: CURZON_VENUES,
  requestsPerMinute: 20,
  delayBetweenRequests: 1500,
};

// ============================================================================
// Vista API Types
// ============================================================================

interface VistaFilm {
  ID: string;
  Title: string;
  ShortCode: string;
  Rating: string;
  RunTime: number;
  Synopsis?: string;
  CinemaId: string;
}

interface VistaSession {
  ID: string;
  CinemaId: string;
  FilmId: string;
  ScreenName: string;
  ScreenNumber: number;
  SessionDateTime: string; // ISO format
  SessionDisplayPriority: number;
  SessionAttributesNames: string[];
  BookingUrl?: string;
}

interface VistaShowtimesResponse {
  Films: VistaFilm[];
  Sessions: VistaSession[];
}

// ============================================================================
// Curzon Scraper Implementation
// ============================================================================

export class CurzonScraper implements ChainScraper {
  chainConfig = CURZON_CONFIG;
  private authToken: string | null = null;

  /**
   * Fetch auth token from Curzon site
   * The token is embedded in the page's initial data
   */
  private async getAuthToken(): Promise<string> {
    if (this.authToken) return this.authToken;

    console.log("[curzon] Fetching auth token...");

    const response = await fetch(`${this.chainConfig.baseUrl}/venues/soho/`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    const html = await response.text();

    // Extract authToken from initialData in the page
    const tokenMatch = html.match(/"authToken"\s*:\s*"([^"]+)"/);
    if (!tokenMatch) {
      throw new Error("Could not extract Curzon auth token");
    }

    this.authToken = tokenMatch[1];
    console.log("[curzon] Auth token obtained");
    return this.authToken;
  }

  /**
   * Fetch showtimes from Vista API for a specific venue
   */
  private async fetchVenueShowtimes(venue: VenueConfig): Promise<VistaShowtimesResponse | null> {
    const token = await this.getAuthToken();

    // Vista API endpoint for getting scheduled films
    const apiUrl = `${this.chainConfig.apiUrl}/ocapi/v1/browsing/master-data/films-and-sessions`;

    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 30);

    const params = new URLSearchParams({
      cinemaId: venue.chainVenueId || "",
      dateFrom: today.toISOString().split("T")[0],
      dateTo: endDate.toISOString().split("T")[0],
    });

    try {
      const response = await fetch(`${apiUrl}?${params}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        console.error(`[curzon] API error for ${venue.name}: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error(`[curzon] Failed to fetch ${venue.name}:`, error);
      return null;
    }
  }

  /**
   * Parse Vista API response into RawScreenings
   */
  private parseShowtimes(data: VistaShowtimesResponse, venue: VenueConfig): RawScreening[] {
    const screenings: RawScreening[] = [];
    const filmsById = new Map(data.Films.map(f => [f.ID, f]));

    for (const session of data.Sessions) {
      const film = filmsById.get(session.FilmId);
      if (!film) continue;

      const datetime = new Date(session.SessionDateTime);
      if (isNaN(datetime.getTime())) continue;

      // Detect format from session attributes
      let format: string | undefined;
      const attrs = session.SessionAttributesNames || [];
      if (attrs.some(a => /imax/i.test(a))) format = "imax";
      else if (attrs.some(a => /70mm/i.test(a))) format = "70mm";
      else if (attrs.some(a => /35mm/i.test(a))) format = "35mm";
      else if (attrs.some(a => /4k|dcp/i.test(a))) format = "dcp_4k";
      else if (attrs.some(a => /dolby\s*cinema/i.test(a))) format = "dolby_cinema";

      // Detect event type
      let eventType: string | undefined;
      if (attrs.some(a => /q\s*&?\s*a/i.test(a))) eventType = "q_and_a";
      else if (attrs.some(a => /preview/i.test(a))) eventType = "preview";
      else if (attrs.some(a => /premiere/i.test(a))) eventType = "premiere";
      else if (attrs.some(a => /intro/i.test(a))) eventType = "intro";

      const bookingUrl = `${this.chainConfig.baseUrl}/booking/${venue.slug}/${session.ID}`;

      screenings.push({
        filmTitle: film.Title,
        datetime,
        screen: session.ScreenName || `Screen ${session.ScreenNumber}`,
        format,
        bookingUrl,
        eventType,
        sourceId: `curzon-${venue.id}-${session.ID}`,
      });
    }

    return screenings;
  }

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
        console.warn(`[curzon] Unknown venue: ${venueId}`);
        continue;
      }

      console.log(`[curzon] Scraping ${venue.name}...`);
      const screenings = await this.scrapeVenue(venueId);
      results.set(venueId, screenings);

      // Rate limiting
      await new Promise(r => setTimeout(r, this.chainConfig.delayBetweenRequests));
    }

    return results;
  }

  /**
   * Scrape single venue
   */
  async scrapeVenue(venueId: string): Promise<RawScreening[]> {
    const venue = this.chainConfig.venues.find(v => v.id === venueId);
    if (!venue) {
      console.error(`[curzon] Venue not found: ${venueId}`);
      return [];
    }

    const data = await this.fetchVenueShowtimes(venue);
    if (!data) return [];

    const screenings = this.parseShowtimes(data, venue);
    console.log(`[curzon] ${venue.name}: ${screenings.length} screenings`);

    return screenings;
  }

  /**
   * Health check - verify API is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getAuthToken();
      return true;
    } catch {
      return false;
    }
  }
}

// Factory function
export function createCurzonScraper(): CurzonScraper {
  return new CurzonScraper();
}

// Get active venues for easy reference
export function getActiveCurzonVenues(): VenueConfig[] {
  return CURZON_VENUES.filter(v => v.active !== false);
}

// Get all London Curzon venues (for adding to database)
export function getLondonCurzonVenues(): VenueConfig[] {
  const londonPostcodes = ["W1", "WC", "EC", "E1", "N1", "SW", "SE", "NW", "KT", "TW"];
  return CURZON_VENUES.filter(v =>
    v.postcode && londonPostcodes.some(p => v.postcode!.startsWith(p))
  );
}
