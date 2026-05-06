/**
 * Castle Sidcup Scraper
 *
 * Community cinema in Sidcup (formerly Sidcup Storyteller), now operated by
 * Castle Cinema. Same Wagtail-based platform as Castle Cinema Hackney; reads
 * the /calendar/ page via the shared `castle-calendar` parser.
 *
 * Website: https://castlesidcup.com
 */

import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";
import { checkHealth } from "../utils/health-check";
import {
  fetchCalendarHtml,
  parseCalendarPage,
  validateScreenings,
} from "./castle-calendar";

const CASTLE_SIDCUP_CONFIG: ScraperConfig = {
  cinemaId: "castle-sidcup",
  baseUrl: "https://castlesidcup.com",
  requestsPerMinute: 30,
  delayBetweenRequests: 500,
};

export class CastleSidcupScraper implements CinemaScraper {
  config = CASTLE_SIDCUP_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log("[castle-sidcup] Fetching /calendar/ page...");

    const html = await fetchCalendarHtml(this.config.baseUrl);
    const screenings = parseCalendarPage(html, "castle-sidcup", this.config.baseUrl);
    console.log(
      `[castle-sidcup] Parsed ${screenings.length} screenings from calendar`,
    );

    const validated = validateScreenings(screenings);
    console.log(
      `[castle-sidcup] ${validated.length} valid screenings after filtering`,
    );

    return validated;
  }

  async healthCheck(): Promise<boolean> {
    return checkHealth(this.config.baseUrl);
  }
}

/** Creates a scraper for The Castle Cinema (Sidcup). */
export function createCastleSidcupScraper(): CastleSidcupScraper {
  return new CastleSidcupScraper();
}
