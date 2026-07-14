/**
 * Regent Street Cinema Scraper
 *
 * Cinema: Regent Street Cinema (Marylebone)
 * Address: 307 Regent Street, London W1B 2HW
 * Website: https://www.regentstreetcinema.com
 *
 * "Birthplace of British cinema" - first cinema screening in 1896.
 * Only UK cinema with 16mm/35mm/Super8/4K projection.
 *
 * On the INDY Systems platform — scraped via a DIRECT GraphQL fetch through the
 * shared client in ../platforms/indy.ts (no browser). This replaced the old
 * Playwright response-interception that waited on fragile 20s/3s timers.
 * sourceId scheme unchanged: `regent-street-{showing.id}`.
 */

import {
  fetchIndyShowings,
  checkIndyHealth,
  type IndyVenue,
} from "../platforms/indy";
import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";

const REGENT_STREET_VENUE: IndyVenue = {
  cinemaId: "regent-street",
  baseUrl: "https://www.regentstreetcinema.com",
  circuitId: "19",
  siteId: "85",
};

const REGENT_STREET_CONFIG: ScraperConfig = {
  cinemaId: REGENT_STREET_VENUE.cinemaId,
  baseUrl: REGENT_STREET_VENUE.baseUrl,
  // Decorative for INDY: the per-date request pacing lives inside
  // fetchIndyShowings (DEFAULT_REQUEST_DELAY_MS); these are not consumed by the
  // single-call scrape() path, kept only to satisfy ScraperConfig.
  requestsPerMinute: 20,
  delayBetweenRequests: 250,
};

export class RegentStreetScraper implements CinemaScraper {
  config = REGENT_STREET_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log(`[${this.config.cinemaId}] Scraping via INDY GraphQL (direct fetch)...`);
    const screenings = await fetchIndyShowings(REGENT_STREET_VENUE);
    console.log(`[${this.config.cinemaId}] Found ${screenings.length} screenings`);
    return screenings;
  }

  async healthCheck(): Promise<boolean> {
    return checkIndyHealth(REGENT_STREET_VENUE);
  }
}

/** Creates a Regent Street Cinema scraper (INDY direct-fetch, implements CinemaScraper). */
export function createRegentStreetScraper(): RegentStreetScraper {
  return new RegentStreetScraper();
}
