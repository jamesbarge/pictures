/**
 * Phoenix Cinema Scraper
 *
 * Cinema: Phoenix Cinema (East Finchley)
 * Address: 52 High Rd, London N2 9PJ
 * Website: https://phoenixcinema.co.uk
 *
 * Phoenix is on the Savoy Systems MODERN JSON template: /whats-on/ 301s to
 * /PhoenixCinemaLondon.dll/Home, which embeds `var Events = {"Events":[...]}`
 * holding every bookable event and all of its performances. Parsing is shared
 * with Rio via ../platforms/savoy.ts; this scraper supplies the fetch, the
 * venue config and the Phoenix-specific clean-up below.
 *
 * Do NOT go back to discovering films from the rendered programme grid. The
 * site's own Populate() stops after 16 events (`if (TheNumEventsDisplayed <= 15)`),
 * so the old Playwright scraper only ever saw the first 16 events by date and
 * silently dropped everything later (2026-10-04: 16 of 40 events, 32 of 57
 * future performances, horizon 14 days where the blob runs to June 2027).
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { parseSavoyEvents, type SavoyVenue } from "../platforms/savoy";
import { decodeHtmlEntities } from "@/lib/title-patterns";

const PROGRAMME_URL = "https://www.phoenixcinema.co.uk/whats-on/";
/** Relative performance URLs ("Booking?Booking=...") resolve against the .dll directory. */
const DLL_BASE = "https://www.phoenixcinema.co.uk/PhoenixCinemaLondon.dll/";

/**
 * Titles in the blob are HTML-encoded ("Q&amp;A") and sometimes padded
 * (" THE FATHER (2020) ..."). Decode and trim to match what the old DOM scraper
 * read through `textContent.trim()`, which keeps the sourceIds below stable.
 */
function phoenixTitle(raw: string): string {
  return decodeHtmlEntities(raw).trim();
}

const PHOENIX_VENUE: SavoyVenue = {
  cinemaId: "phoenix-east-finchley",
  baseUrl: "https://www.phoenixcinema.co.uk",
  // Mixed programme (opera, theatre, ballet, live-score events) is kept in
  // full, as before; the pipeline classifies non-film events.
  // sourceId scheme is unchanged from the DOM scraper so existing rows upsert
  // in place: `phoenix-{title slug}-{ISO}`.
  buildSourceId: (event, _perf, datetime) =>
    `phoenix-${phoenixTitle(event.Title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${datetime.toISOString()}`,
  // perf.URL is the performance's own booking link: relative for Savoy
  // ticketing, absolute for partner ticketing (cinematik, eidocinema,
  // japanesefilm.club). Partner links are typed by venue staff, so a malformed
  // one falls back to the film page; letting `new URL` throw would fail the
  // whole venue.
  buildBookingUrl: (event, perf, baseUrl) => {
    const fallback = event.URL || `${baseUrl}/whats-on/`;
    if (!perf.URL) return fallback;
    try {
      return new URL(perf.URL, DLL_BASE).href;
    } catch {
      console.warn(`[phoenix-east-finchley] Unparseable booking URL for "${event.Title}": ${perf.URL}`);
      return fallback;
    }
  },
};

export class PhoenixScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: PHOENIX_VENUE.cinemaId,
    baseUrl: PHOENIX_VENUE.baseUrl,
    requestsPerMinute: 10,
    delayBetweenRequests: 1000,
  };

  protected async fetchPages(): Promise<string[]> {
    // One server-rendered page carries the whole programme; fetch follows the
    // 301 to /PhoenixCinemaLondon.dll/Home.
    console.log(`[${this.config.cinemaId}] Fetching programme: ${PROGRAMME_URL}`);
    return [await this.fetchUrl(PROGRAMME_URL)];
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const screenings = (await parseSavoyEvents(htmlPages[0], PHOENIX_VENUE)).map((s) => ({
      ...s,
      filmTitle: phoenixTitle(s.filmTitle),
      director: s.director?.trim() || undefined,
      // "Screen 1 Oversell" is Savoy's allocation for free events, not a room.
      screen: s.screen?.replace(/\s+Oversell$/i, ""),
      // StartTime is a zero-padded 24h UK-local HHMM clock: no AM/PM ambiguity.
      // The 90-day future cap still applies (see types.ts).
      timeSource: "local-24h" as const,
    }));
    console.log(`[${this.config.cinemaId}] Found ${screenings.length} future screenings`);
    return screenings;
  }
}

/** Create and return a new Phoenix Cinema scraper instance. */
export function createPhoenixScraper(): PhoenixScraper {
  return new PhoenixScraper();
}
