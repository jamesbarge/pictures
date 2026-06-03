/**
 * Cinema Museum Scraper
 *
 * The Cinema Museum (Kennington, SE11) is an independent venue inside the
 * former Lambeth workhouse. Programmes a mix of repertory film screenings
 * (often 35mm and silent), Kennington Bioscope evenings, talks, and museum
 * tours. Identified as Priority 2 in the 2026-05-15 London coverage audit.
 *
 * Approach: parse the WordPress site's public iCal feed
 *   https://cinemamuseum.org.uk/schedule/?ical=1
 *
 * iCal is dramatically easier to scrape than the HTML calendar: the feed
 * already carries timezone-aware DTSTART, SUMMARY, URL, UID, and CATEGORIES
 * per event. No DOM scraping needed.
 *
 * Filtering:
 *   - "Tours" category (museum tours) is excluded — not film screenings.
 *   - "Bazaars" category (bric-a-brac sales) is excluded.
 *   - Everything else is emitted; the pipeline's classifyScreening will
 *     downstream-categorise talks vs film screenings.
 *
 * UID format: `<post-id>-<dtstart-epoch>-<dtend-epoch>@cinemamuseum.org.uk` —
 * stable across runs. Used as `sourceId` (with a `cinema-museum-` prefix so
 * it doesn't collide with anyone else's numeric IDs).
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { FestivalDetector } from "../festivals/festival-detector";
import { ukLocalToUTC } from "../utils/date-parser";
import { parseVEvents } from "../utils/ical-parser";

// Re-export so existing tests / imports of `parseVEvents` from this module
// keep working. New code should import directly from `../utils/ical-parser`.
export { parseVEvents } from "../utils/ical-parser";

const ICAL_URL = "https://cinemamuseum.org.uk/schedule/?ical=1";
const BASE_URL = "https://cinemamuseum.org.uk";

/** Categories we never treat as cinema screenings. */
const EXCLUDED_CATEGORIES = new Set([
  "Tours",
  "Bazaar",
  "Bazaars",
]);

export class CinemaMuseumScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "cinema-museum",
    baseUrl: BASE_URL,
    requestsPerMinute: 30,
    delayBetweenRequests: 0,
  };

  protected async fetchPages(): Promise<string[]> {
    console.log(`[${this.config.cinemaId}] Fetching iCal feed: ${ICAL_URL}`);
    // Override the BaseScraper's UA: the WP host's WAF blocks browser-looking
    // user agents on the iCal feed (returns 403 for "Mozilla/5.0 ... Chrome/120
    // ..."), but allows generic calendar-client UAs. We hand-roll the fetch
    // here rather than monkey-patching the base class.
    const response = await fetch(ICAL_URL, {
      headers: {
        // Calendar-client-style UA — matches what Google/Apple iCal subscribers send
        "User-Agent": "Mozilla/5.0 (compatible; pictures-cinema-museum-scraper/1.0; +https://pictures.london)",
        Accept: "text/calendar, text/plain;q=0.9, */*;q=0.5",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`iCal fetch failed: HTTP ${response.status} ${response.statusText}`);
    }
    return [await response.text()];
  }

  /**
   * Override the BaseScraper healthCheck for the same reason: the WAF rejects
   * the default Chrome UA. We HEAD the iCal feed with the same compatible UA.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(ICAL_URL, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; pictures-cinema-museum-scraper/1.0; +https://pictures.london)",
        },
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    await FestivalDetector.preload();
    const screenings: RawScreening[] = [];

    for (const ical of htmlPages) {
      screenings.push(...this.parseICal(ical));
    }
    console.log(`[${this.config.cinemaId}] Parsed ${screenings.length} screenings`);
    return screenings;
  }

  /**
   * Public for unit tests. Converts a full iCal feed to RawScreening rows,
   * applying the excluded-categories filter.
   */
  parseICal(icalText: string): RawScreening[] {
    const events = parseVEvents(icalText);
    const screenings: RawScreening[] = [];

    for (const ev of events) {
      // Drop museum tours and bazaars — not cinema programming
      if (ev.categories.some((c) => EXCLUDED_CATEGORIES.has(c))) continue;

      const { year, month, day, hour, minute } = ev.dtStartUKLocal;
      const datetime = ukLocalToUTC(year, month, day, hour, minute);
      if (!datetime || isNaN(datetime.getTime())) continue;

      screenings.push({
        filmTitle: ev.summary,
        datetime,
        bookingUrl: ev.url ?? `${BASE_URL}/schedule/`,
        sourceId: `cinema-museum-${ev.uid}`,
      });
    }

    return screenings;
  }
}

export function createCinemaMuseumScraper(): CinemaMuseumScraper {
  return new CinemaMuseumScraper();
}
