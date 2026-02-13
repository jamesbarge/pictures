/**
 * Curzon Cinemas Scraper
 *
 * Uses Playwright to capture JWT auth token, then makes direct API calls
 * to the Vista OCAPI for fast, reliable showtime data.
 *
 * Website: https://www.curzon.com
 * API: https://vwc.curzon.com/WSVistaWebClient/ocapi/v1/
 *
 * To add a new Curzon venue:
 * 1. Add venue config to CURZON_VENUES array below
 * 2. Find the venue's Vista siteId (e.g., "SOH1" for Soho)
 */

import type { ChainConfig, VenueConfig, RawScreening, ChainScraper } from "../types";
import { FestivalDetector } from "../festivals/festival-detector";
import { getBrowser, closeBrowser, createPage } from "../utils/browser";
import type { Page } from "playwright";

// ============================================================================
// Curzon Venue Configurations
// chainVenueId is the Vista API site code (e.g., "SOH1" for Soho)
// ============================================================================

export const CURZON_VENUES: VenueConfig[] = [
  {
    id: "curzon-soho",
    name: "Curzon Soho",
    shortName: "Curzon Soho",
    slug: "soho",
    area: "Soho",
    postcode: "W1D 5DY",
    address: "99 Shaftesbury Avenue",
    chainVenueId: "SOH1",
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
    chainVenueId: "MAY1",
    features: ["historic", "single_screen"],
    active: true,
  },
  {
    id: "curzon-bloomsbury",
    name: "Curzon Bloomsbury",
    shortName: "Curzon Blooms",
    slug: "bloomsbury",
    area: "Bloomsbury",
    postcode: "WC1H 8AG",
    address: "The Brunswick Centre",
    chainVenueId: "BLO1",
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
    chainVenueId: "ALD1",
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
    chainVenueId: "VIC1",
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
    chainVenueId: "HOX1",
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
    chainVenueId: "KIN1",
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
    chainVenueId: "RIC1",
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
    chainVenueId: "WIM01",
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
    chainVenueId: "CAM1",
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
  venues: CURZON_VENUES,
  requestsPerMinute: 30, // API is fast
  delayBetweenRequests: 500,
};

// ============================================================================
// Vista OCAPI Response Types
// ============================================================================

interface VistaShowtime {
  id: string;
  schedule: {
    businessDate: string;
    startsAt: string; // ISO datetime
    filmStartsAt: string;
  };
  filmId: string;
  siteId: string;
  screenId: string;
  isSoldOut: boolean;
  attributeIds: string[];
  eventId: string | null;
}

interface VistaFilm {
  id: string;
  title: { text: string };
  synopsis?: { text: string };
  releaseDate?: string;
  runtimeInMinutes?: number;
  castAndCrew?: Array<{
    castAndCrewMemberId: string;
    roles: string[];
  }>;
}

interface VistaCastMember {
  id: string;
  firstName?: string;
  lastName?: string;
}

interface VistaAttribute {
  id: string;
  name: { text: string };
}

interface VistaShowtimesResponse {
  businessDate: string;
  showtimes: VistaShowtime[];
  relatedData: {
    films: VistaFilm[];
    castAndCrew?: VistaCastMember[];
    attributes?: VistaAttribute[];
  };
}

interface VistaScreeningDatesResponse {
  filmScreeningDates: Array<{
    businessDate: string;
  }>;
}

// ============================================================================
// Curzon Scraper Implementation (Hybrid: Playwright for auth, API for data)
// ============================================================================

export class CurzonScraper implements ChainScraper {
  chainConfig = CURZON_CONFIG;
  private page: Page | null = null;
  private authToken: string | null = null;
  private apiBase = "https://vwc.curzon.com/WSVistaWebClient/ocapi/v1";

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
    await FestivalDetector.preload();

    try {
      // Initialize and capture auth token
      await this.initialize();

      if (!this.authToken) {
        console.error("[curzon] Failed to capture auth token");
        return results;
      }

      console.log("[curzon] Auth token captured, starting API scrape...");

      for (const venueId of venueIds) {
        const venue = this.chainConfig.venues.find(v => v.id === venueId);
        if (!venue) {
          console.warn(`[curzon] Unknown venue: ${venueId}`);
          continue;
        }

        console.log(`[curzon] Scraping ${venue.name} (${venue.chainVenueId})...`);
        const screenings = await this.scrapeVenueViaApi(venue);
        results.set(venueId, screenings);

        // Small delay between venues
        await new Promise(r => setTimeout(r, this.chainConfig.delayBetweenRequests));
      }
    } finally {
      await this.cleanup();
    }

    return results;
  }

  /**
   * Scrape single venue via API
   */
  async scrapeVenue(venueId: string): Promise<RawScreening[]> {
    const venue = this.chainConfig.venues.find(v => v.id === venueId);
    if (!venue) {
      console.error(`[curzon] Venue not found: ${venueId}`);
      return [];
    }

    if (!this.authToken) {
      await this.initialize();
    }

    if (!this.authToken) {
      console.error("[curzon] No auth token available");
      return [];
    }

    return this.scrapeVenueViaApi(venue);
  }

  /**
   * Scrape venue using Vista API
   */
  private async scrapeVenueViaApi(venue: VenueConfig): Promise<RawScreening[]> {
    const siteId = venue.chainVenueId;
    if (!siteId) {
      console.error(`[curzon] No siteId for venue: ${venue.id}`);
      return [];
    }

    const allScreenings: RawScreening[] = [];

    try {
      // Get available screening dates for this venue
      const dates = await this.getAvailableDates(siteId);
      if (dates.length === 0) {
        console.warn(`[curzon] No screening dates found for ${venue.name}`);
        return [];
      }

      console.log(`[curzon] ${venue.name}: ${dates.length} dates to fetch`);

      // Fetch showtimes for each date (limit to 14 days ahead)
      const datesToFetch = dates.slice(0, 14);

      for (const date of datesToFetch) {
        try {
          const response = await this.fetchWithAuth(
            `${this.apiBase}/showtimes/by-business-date/${date}?siteIds=${siteId}`
          );

          if (!response.ok) {
            console.warn(`[curzon] API error for ${date}: ${response.status}`);
            continue;
          }

          const data: VistaShowtimesResponse = await response.json();
          const screenings = this.convertToRawScreenings(data, venue);
          allScreenings.push(...screenings);

          // Small delay between dates
          await new Promise(r => setTimeout(r, 100));
        } catch (error) {
          console.warn(`[curzon] Error fetching ${date} for ${venue.name}:`, error);
        }
      }

      console.log(`[curzon] ${venue.name}: ${allScreenings.length} screenings`);
      return this.deduplicate(allScreenings);

    } catch (error) {
      console.error(`[curzon] Error scraping ${venue.name}:`, error);
      return [];
    }
  }

  /**
   * Get available screening dates for a venue
   */
  private async getAvailableDates(siteId: string): Promise<string[]> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBase}/film-screening-dates?siteIds=${siteId}`
      );

      if (!response.ok) {
        console.warn(`[curzon] Failed to get dates: ${response.status}`);
        return [];
      }

      const data: VistaScreeningDatesResponse = await response.json();
      return data.filmScreeningDates?.map(d => d.businessDate) || [];
    } catch (error) {
      console.warn(`[curzon] Error getting dates for ${siteId}:`, error);
      return [];
    }
  }

  /**
   * Make authenticated API request
   */
  private async fetchWithAuth(url: string): Promise<Response> {
    return fetch(url, {
      headers: {
        "Authorization": this.authToken!,
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
  }

  /**
   * Convert Vista API response to RawScreenings
   */
  private convertToRawScreenings(
    data: VistaShowtimesResponse,
    venue: VenueConfig
  ): RawScreening[] {
    const screenings: RawScreening[] = [];

    // Build film lookup
    const filmMap = new Map<string, VistaFilm>();
    for (const film of data.relatedData?.films || []) {
      filmMap.set(film.id, film);
    }

    // Build cast/crew lookup for directors
    const castMap = new Map<string, VistaCastMember>();
    for (const member of data.relatedData?.castAndCrew || []) {
      castMap.set(member.id, member);
    }

    // Build attribute lookup for accessibility features
    const attrMap = new Map<string, string>();
    for (const attr of data.relatedData?.attributes || []) {
      attrMap.set(attr.id, attr.name?.text || "");
    }

    for (const showtime of data.showtimes || []) {
      const film = filmMap.get(showtime.filmId);
      if (!film) {
        console.warn(`[curzon] Film not found: ${showtime.filmId}`);
        continue;
      }

      // Parse datetime from ISO string
      const datetime = new Date(showtime.schedule.startsAt);
      if (isNaN(datetime.getTime())) {
        console.warn(`[curzon] Invalid datetime: ${showtime.schedule.startsAt}`);
        continue;
      }

      // Get film title
      const filmTitle = film.title?.text || "";
      if (!filmTitle) continue;

      // Find director from cast/crew
      let director: string | undefined;
      const directorRef = film.castAndCrew?.find(c => c.roles?.includes("Director"));
      if (directorRef) {
        const directorMember = castMap.get(directorRef.castAndCrewMemberId);
        if (directorMember) {
          const parts = [directorMember.firstName, directorMember.lastName].filter(Boolean);
          if (parts.length > 0) {
            director = parts.join(" ");
          }
        }
      }

      // Extract year from release date
      let year: number | undefined;
      if (film.releaseDate) {
        const yearMatch = film.releaseDate.match(/^(\d{4})/);
        if (yearMatch) {
          year = parseInt(yearMatch[1]);
        }
      }

      // Build booking URL
      const bookingUrl = `${this.chainConfig.baseUrl}/ticketing/seats/${showtime.id}/`;

      // Check for accessibility features
      const eventDescriptions: string[] = [];
      for (const attrId of showtime.attributeIds || []) {
        const attrName = attrMap.get(attrId);
        if (attrName) {
          // Common Vista attribute patterns
          if (attrName.toLowerCase().includes("caption") || attrName.toLowerCase().includes("subtitled")) {
            eventDescriptions.push("Subtitled");
          }
          if (attrName.toLowerCase().includes("audio") && attrName.toLowerCase().includes("descri")) {
            eventDescriptions.push("Audio Described");
          }
          if (attrName.toLowerCase().includes("baby")) {
            eventDescriptions.push("Baby Friendly");
          }
          if (attrName.toLowerCase().includes("q&a") || attrName.toLowerCase().includes("q & a")) {
            eventDescriptions.push("Q&A");
          }
        }
      }

      const sourceId = `curzon-${showtime.id}`;

      screenings.push({
        filmTitle,
        datetime,
        bookingUrl,
        sourceId,
        year,
        director,
        eventDescription: eventDescriptions.length > 0 ? eventDescriptions.join(", ") : undefined,
        // Availability status from Vista API
        availabilityStatus: showtime.isSoldOut ? "sold_out" : "available",
        ...FestivalDetector.detect(venue.id, filmTitle, datetime, bookingUrl),
      });
    }

    return screenings;
  }

  /**
   * Initialize Playwright and capture auth token
   */
  private async initialize(): Promise<void> {
    console.log(`[curzon] Launching browser to capture auth token...`);
    await getBrowser();
    this.page = await createPage();

    // Intercept requests to capture the JWT token
    this.page.on("request", (request) => {
      const url = request.url();
      if (url.includes("vwc.curzon.com") && !this.authToken) {
        const authHeader = request.headers()["authorization"];
        if (authHeader && authHeader.startsWith("Bearer ")) {
          this.authToken = authHeader;
          console.log("[curzon] Auth token captured!");
        }
      }
    });

    // Visit any venue page to trigger the Vista SDK which generates the token
    try {
      await this.page.goto(`${this.chainConfig.baseUrl}/venues/soho/`, {
        waitUntil: "networkidle",
        timeout: 45000
      });

      // Wait a bit for API calls to be made
      await this.page.waitForTimeout(3000);

      // Close any popups
      try {
        await this.page.keyboard.press("Escape");
      } catch {
        // Ignore
      }

      if (!this.authToken) {
        console.warn("[curzon] Token not captured during page load, waiting longer...");
        await this.page.waitForTimeout(5000);
      }
    } catch (error) {
      console.error("[curzon] Error during initialization:", error);
    }
  }

  /**
   * Cleanup browser resources
   */
  private async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    await closeBrowser();
    this.authToken = null;
    console.log(`[curzon] Browser closed`);
  }

  /**
   * Remove duplicate screenings
   */
  private deduplicate(screenings: RawScreening[]): RawScreening[] {
    const seen = new Set<string>();
    const now = new Date();

    return screenings.filter((s) => {
      if (!s.filmTitle || s.filmTitle.trim() === "") return false;
      if (!s.datetime || isNaN(s.datetime.getTime())) return false;
      if (s.datetime < now) return false;

      if (s.sourceId && seen.has(s.sourceId)) return false;
      if (s.sourceId) seen.add(s.sourceId);

      return true;
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.chainConfig.baseUrl, { method: "HEAD" });
      return response.ok;
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
