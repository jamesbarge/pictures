/**
 * Castle Cinema Scraper (Hackney)
 *
 * Community cinema in Homerton with 82-seat main screen + 27-seat second screen.
 * Reads the /calendar/ page (the source of truth for the full programmed window)
 * via the shared `castle-calendar` parser. The previous implementation used
 * homepage JSON-LD, which only surfaces ~7 days of programming.
 *
 * Website: https://thecastlecinema.com
 * Booking: https://castlecinema.admit-one.co.uk
 */

import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";
import { checkHealth } from "../utils/health-check";
import {
  fetchCalendarHtml,
  parseCalendarPage,
  validateScreenings,
} from "./castle-calendar";

// ============================================================================
// Castle Cinema Configuration
// ============================================================================

export const CASTLE_CONFIG: ScraperConfig = {
  cinemaId: "castle",
  baseUrl: "https://thecastlecinema.com",
  requestsPerMinute: 30,
  delayBetweenRequests: 500,
};

export const CASTLE_VENUE = {
  id: "castle",
  name: "The Castle Cinema",
  shortName: "Castle",
  area: "Hackney",
  postcode: "E9 6DA",
  address: "First floor, 64-66 Brooksby's Walk",
  features: ["independent", "community", "arthouse", "bar", "restaurant"],
  website: "https://thecastlecinema.com",
};

// ============================================================================
// Castle Cinema Scraper Implementation
// ============================================================================

export class CastleScraper implements CinemaScraper {
  config = CASTLE_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log("[castle-cinema] Fetching /calendar/ page...");

    const html = await fetchCalendarHtml(this.config.baseUrl);
    const screenings = parseCalendarPage(html, "castle", this.config.baseUrl);
    console.log(
      `[castle-cinema] Parsed ${screenings.length} screenings from calendar`,
    );

    const validated = validateScreenings(screenings);
    console.log(
      `[castle-cinema] ${validated.length} valid screenings after filtering`,
    );

    return validated;
  }

  async healthCheck(): Promise<boolean> {
    return checkHealth(this.config.baseUrl);
  }
}

// Factory function
/** Creates a scraper for The Castle Cinema (Hackney). */
export function createCastleScraper(): CastleScraper {
  return new CastleScraper();
}
