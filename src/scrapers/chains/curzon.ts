/**
 * Curzon Cinemas Scraper
 *
 * Uses Playwright to load a venue page and extract the JWT auth token from
 * window.initialData.api.authToken (server-side rendered by Curzon's backend),
 * then makes direct API calls to the Vista OCAPI for fast, reliable showtime data.
 *
 * The token is embedded in the SSR HTML, so we only need to load the page and
 * read the JS context — no need to wait for SPA API calls or intercept requests.
 * Falls back to request interception if the SSR token is not found.
 *
 * Website: https://www.curzon.com
 * API: https://digital-api.curzon.com/ocapi/v1/
 *
 * To add a new Curzon venue:
 * 1. Add venue config to CURZON_VENUES array below
 * 2. Find the venue's Vista siteId (e.g., "SOH1" for Soho)
 */

import type { ChainConfig, VenueConfig, RawScreening, ChainScraper } from "../types";
import { CHROME_USER_AGENT } from "../constants";
import { FestivalDetector } from "../festivals/festival-detector";
import { getBrowser, closeBrowser, createPage } from "../utils/browser";
import type { Page } from "rebrowser-playwright";

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
    active: false, // Venue closed — no listings since Feb 2026
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
    active: false, // Venue closed — no listings since Feb 2026
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
    active: false, // Venue closed — no listings since Feb 2026
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
// Helpers — extracted from convertToRawScreenings for readability
// ============================================================================

/** Resolve the director name from cross-referenced Vista cast data. */
function extractDirector(
  film: VistaFilm,
  castMap: Map<string, VistaCastMember>,
): string | undefined {
  const directorRef = film.castAndCrew?.find(c => c.roles?.includes("Director"));
  if (!directorRef) return undefined;
  const member = castMap.get(directorRef.castAndCrewMemberId);
  if (!member) return undefined;
  const parts = [member.firstName, member.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/** Classify Vista attribute IDs into human-readable accessibility labels. */
function classifyAccessibilityFeatures(
  attributeIds: string[],
  attrMap: Map<string, string>,
): string[] {
  const descriptions: string[] = [];
  for (const attrId of attributeIds) {
    const attrName = attrMap.get(attrId);
    if (!attrName) continue;
    const lower = attrName.toLowerCase();
    if (lower.includes("caption") || lower.includes("subtitled")) descriptions.push("Subtitled");
    if (lower.includes("audio") && lower.includes("descri")) descriptions.push("Audio Described");
    if (lower.includes("baby")) descriptions.push("Baby Friendly");
    if (lower.includes("q&a") || lower.includes("q & a")) descriptions.push("Q&A");
  }
  return descriptions;
}

// ============================================================================
// Curzon Scraper Implementation (Hybrid: Playwright for auth, API for data)
// ============================================================================

export class CurzonScraper implements ChainScraper {
  chainConfig = CURZON_CONFIG;
  private page: Page | null = null;
  private authToken: string | null = null;
  private apiBase = "https://digital-api.curzon.com/ocapi/v1";

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

      // Fetch showtimes for the next 30 published dates. The Vista API returns
      // a list of business dates with screenings, not consecutive calendar
      // days — taking the first N entries is a horizon on "days with anything
      // programmed", which suits Curzon's release-driven schedule. 30 covers
      // their typical 4-8 week publication window.
      const datesToFetch = dates.slice(0, 30);

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
        "User-Agent": CHROME_USER_AGENT,
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

      const director = extractDirector(film, castMap);

      // Extract year from release date
      let year: number | undefined;
      if (film.releaseDate) {
        const yearMatch = film.releaseDate.match(/^(\d{4})/);
        if (yearMatch) {
          year = parseInt(yearMatch[1]);
        }
      }

      // Build booking URL — link to film detail page (the ?sessionId= deep links show "Showtime unavailable")
      const filmSlug = filmTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const bookingUrl = `${this.chainConfig.baseUrl}/films/${filmSlug}/${showtime.filmId}/`;

      const eventDescriptions = classifyAccessibilityFeatures(showtime.attributeIds || [], attrMap);

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
   * Initialize Playwright and capture auth token.
   *
   * Primary strategy: Extract the JWT from window.initialData.api.authToken,
   * which is server-side rendered into the page HTML by Curzon's backend.
   * This is fast and reliable because we only need the DOM, not full SPA init.
   *
   * Fallback strategy: Intercept outgoing requests to digital-api.curzon.com
   * and capture the Authorization header (original approach, slower).
   */
  private async initialize(): Promise<void> {
    console.log(`[curzon] Launching browser to capture auth token...`);
    await getBrowser();
    this.page = await createPage();

    // Fallback: intercept requests in case SSR token extraction fails
    this.page.on("request", (request) => {
      const url = request.url();
      if (url.includes("digital-api.curzon.com") && !this.authToken) {
        const authHeader = request.headers()["authorization"];
        if (authHeader && authHeader.startsWith("Bearer ")) {
          this.authToken = authHeader;
          console.log("[curzon] Auth token captured via request interception (fallback)");
        }
      }
    });

    // Visit a venue page — domcontentloaded is sufficient since the token
    // is SSR'd into the HTML as window.initialData.api.authToken.
    // networkidle never fires on this SPA (analytics/chunks keep loading).
    try {
      await this.page.goto(`${this.chainConfig.baseUrl}/venues/soho/`, {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });

      // Primary: extract token from the server-rendered window.initialData
      try {
        // Wait briefly for the inline script to set window.initialData
        await this.page.waitForFunction(
          () => !!(window as unknown as Record<string, unknown>).initialData,
          { timeout: 10000 }
        );

        const ssrToken = await this.page.evaluate(() => {
          const data = (window as unknown as Record<string, unknown>).initialData as
            { api?: { authToken?: string; apiUrl?: string } } | undefined;
          return {
            authToken: data?.api?.authToken || null,
            apiUrl: data?.api?.apiUrl || null,
          };
        });

        if (ssrToken.authToken) {
          this.authToken = `Bearer ${ssrToken.authToken}`;
          console.log("[curzon] Auth token extracted from SSR initialData");
          if (ssrToken.apiUrl && ssrToken.apiUrl !== "https://digital-api.curzon.com") {
            // Curzon may change API domains again — detect it early
            console.warn(`[curzon] API URL changed: ${ssrToken.apiUrl} (expected digital-api.curzon.com)`);
          }
          return;
        }

        console.warn("[curzon] SSR token not found in initialData, falling back to request interception...");
      } catch {
        console.warn("[curzon] Could not extract SSR token, falling back to request interception...");
      }

      // Fallback: wait for the SPA to make API calls so the request interceptor fires
      if (!this.authToken) {
        await this.page.waitForTimeout(10000);
      }

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
      // Cloudflare blocks HEAD requests, so check the API domain instead.
      // A 401 means the API is up (just needs auth); only connection failures
      // or 5xx indicate the service is actually down.
      const response = await fetch(
        "https://digital-api.curzon.com/ocapi/v1/film-screening-dates?siteIds=SOH1",
        { method: "GET" }
      );
      return response.status === 401 || response.ok;
    } catch {
      return false;
    }
  }
}

// Factory function
export function createCurzonScraper(): CurzonScraper {
  return new CurzonScraper();
}

/** Returns all Curzon venues that are currently active (not disabled). */
export function getActiveCurzonVenues(): VenueConfig[] {
  return CURZON_VENUES.filter(v => v.active !== false);
}

/** Returns Curzon venues located in London, filtered by postcode prefix. */
export function getLondonCurzonVenues(): VenueConfig[] {
  const londonPostcodes = ["W1", "WC", "EC", "E1", "N1", "SW", "SE", "NW", "KT", "TW"];
  return CURZON_VENUES.filter(v =>
    v.postcode && londonPostcodes.some(p => v.postcode!.startsWith(p))
  );
}
