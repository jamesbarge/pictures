/**
 * Rio Cinema Scraper
 * Scrapes film listings from riocinema.org.uk
 *
 * Rio is on the Savoy Systems MODERN JSON template — its homepage embeds
 * `var Events = {"Events":[...]}`. Parsing is handled by the shared client in
 * ../platforms/savoy.ts; this scraper only supplies the fetch + venue config.
 * sourceId scheme unchanged: `rio-dalston-{event.ID}-{ISO}`.
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { parseSavoyEvents, type SavoyVenue } from "../platforms/savoy";

const RIO_VENUE: SavoyVenue = {
  cinemaId: "rio-dalston",
  baseUrl: "https://riocinema.org.uk",
  // Rio has no per-performance TypeDescription — take all performances.
  buildSourceId: (event, _perf, datetime) => `rio-dalston-${event.ID}-${datetime.toISOString()}`,
  // The film-page URL is stable and shows all showtimes; the performance URL
  // (perf.URL) carries session params that expire.
  buildBookingUrl: (event, _perf, baseUrl) => `${baseUrl}/Rio.dll/WhatsOn?f=${event.ID}`,
};

export class RioScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: RIO_VENUE.cinemaId,
    baseUrl: RIO_VENUE.baseUrl,
    requestsPerMinute: 10,
    delayBetweenRequests: 1000,
  };

  protected async fetchPages(): Promise<string[]> {
    // Rio has all data on the homepage as embedded JSON.
    const url = this.config.baseUrl;
    console.log(`[${this.config.cinemaId}] Fetching homepage: ${url}`);
    const html = await this.fetchUrl(url);
    return [html];
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const screenings = await parseSavoyEvents(htmlPages[0], RIO_VENUE);
    console.log(`[${this.config.cinemaId}] Found ${screenings.length} future screenings`);
    return screenings;
  }
}

/** Create and return a new Rio Cinema scraper instance. */
export function createRioScraper(): RioScraper {
  return new RioScraper();
}
