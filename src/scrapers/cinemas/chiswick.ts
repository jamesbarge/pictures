/**
 * The Chiswick Cinema Scraper
 *
 * Cinema: The Chiswick Cinema
 * Address: 94-96 Chiswick High Road, London W4 1SH
 * Website: https://www.chiswickcinema.co.uk
 *
 * On the INDY Systems platform (circuit 56 / site 170) — scraped via the shared
 * direct GraphQL client in ../platforms/indy.ts (same as Regent Street). No
 * browser, no auth. sourceId scheme: `chiswick-cinema-{showing.id}`.
 */

import {
  fetchIndyShowings,
  checkIndyHealth,
  type IndyVenue,
} from "../platforms/indy";
import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";

export const CHISWICK_VENUE: IndyVenue = {
  cinemaId: "chiswick-cinema",
  baseUrl: "https://www.chiswickcinema.co.uk",
  circuitId: "56",
  siteId: "170",
  // Chiswick publishes its full catalog ~5 months ahead (verified live: 66
  // distinct films / bookable showings out to day offset 149 — NT Live, Met
  // Opera, repertory). The shared 35-day default captured only ~16 of those
  // 66, dropping the entire Sep+ tail (e.g. Fargo, Rear Window, Met Opera).
  // 200 gives real margin past the furthest showing found (149 days) rather
  // than sitting flush against it; the far dates are cheap (one GraphQL POST
  // each, mostly empty).
  horizonDays: 200,
};

const CHISWICK_CONFIG: ScraperConfig = {
  cinemaId: CHISWICK_VENUE.cinemaId,
  baseUrl: CHISWICK_VENUE.baseUrl,
  // Decorative for INDY: per-request pacing lives in fetchIndyShowings.
  requestsPerMinute: 20,
  delayBetweenRequests: 250,
};

export class ChiswickScraper implements CinemaScraper {
  config = CHISWICK_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log(`[${this.config.cinemaId}] Scraping via INDY GraphQL (direct fetch)...`);
    const screenings = await fetchIndyShowings(CHISWICK_VENUE);
    console.log(`[${this.config.cinemaId}] Found ${screenings.length} screenings`);
    return screenings;
  }

  async healthCheck(): Promise<boolean> {
    return checkIndyHealth(CHISWICK_VENUE);
  }
}

/** Creates a The Chiswick Cinema scraper (INDY direct-fetch, implements CinemaScraper). */
export function createChiswickScraper(): ChiswickScraper {
  return new ChiswickScraper();
}
