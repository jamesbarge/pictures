/**
 * Bertha DocHouse Scraper
 *
 * Bertha DocHouse is the UK's only year-round documentary cinema, located
 * inside Curzon Bloomsbury (WC1) but operating with its own programming +
 * ticketing pipeline. Distinct from the Curzon chain's general listings.
 *
 * Site structure (verified 2026-05-15):
 *   - List page: https://dochouse.org/whats-on/ (paginated /whats-on/page/N/)
 *     • Each event card has an anchor to /event/<slug>/
 *     • The card itself shows only "Showing from <date>" — no times here
 *   - Detail page: https://dochouse.org/event/<slug>/
 *     • Contains "Screening times and booking" section
 *     • Each screening is `<a href="https://www.curzon.com/ticketing/seats/BLO1-XXXXXX">Fri 15th May 16:30</a>`
 *     • Ticket ID (BLO1-XXXXXX) is unique per screening — use as `sourceId`
 *
 * No Cloudflare; server-side rendered HTML; plain Cheerio works.
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { FestivalDetector } from "../festivals/festival-detector";
import {
  combineDateAndTime,
  parseScreeningDate,
  parseScreeningTime,
} from "../utils/date-parser";
import { normalizeUrl } from "../utils/url";

const BASE_URL = "https://dochouse.org";
const LISTING_PATH = "/whats-on/";
const MAX_LIST_PAGES = 10; // Hard cap — programming horizon is ~2 months
const TICKET_HREF_RE = /\/ticketing\/seats\/(BLO1-\d+)/;

export class BerthaDochouseScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "bertha-dochouse",
    baseUrl: BASE_URL,
    requestsPerMinute: 20,
    delayBetweenRequests: 750,
  };

  protected async fetchPages(): Promise<string[]> {
    const detailUrls = await this.collectDetailUrls();
    console.log(`[${this.config.cinemaId}] Found ${detailUrls.size} event detail URLs`);

    const detailPages: string[] = [];
    let i = 0;
    for (const url of detailUrls) {
      i++;
      try {
        const html = await this.fetchUrl(url);
        detailPages.push(html);
        if (i % 5 === 0) {
          console.log(`[${this.config.cinemaId}] Fetched ${i}/${detailUrls.size} detail pages`);
        }
      } catch (err) {
        // Skip failed pages — don't abort the whole scrape over one 500.
        console.warn(`[${this.config.cinemaId}] Skipping ${url}:`, (err as Error).message);
      }
    }
    console.log(`[${this.config.cinemaId}] Fetched ${detailPages.length}/${detailUrls.size} detail pages total`);
    return detailPages;
  }

  /**
   * Walk listing pages /whats-on/, /whats-on/page/2/, ... and collect every
   * unique event detail URL. Stops when a page yields zero new URLs or when
   * MAX_LIST_PAGES is hit (whichever comes first).
   */
  private async collectDetailUrls(): Promise<Set<string>> {
    const detailUrls = new Set<string>();

    for (let page = 1; page <= MAX_LIST_PAGES; page++) {
      const listUrl =
        page === 1
          ? `${BASE_URL}${LISTING_PATH}`
          : `${BASE_URL}${LISTING_PATH}page/${page}/`;
      console.log(`[${this.config.cinemaId}] Fetching list page ${page}: ${listUrl}`);

      let html: string;
      try {
        html = await this.fetchUrl(listUrl);
      } catch (err) {
        // 404 on /page/N/ means we've walked off the end of the programme.
        console.log(
          `[${this.config.cinemaId}] List page ${page} returned error, assuming end-of-pagination: ${(err as Error).message}`,
        );
        break;
      }

      const $ = this.parseHtml(html);
      const beforeSize = detailUrls.size;

      // Pick up every internal anchor under /event/*/ — there are multiple
      // anchors per card (image, title, "FIND OUT MORE") but the Set dedupes.
      $('a[href*="/event/"]').each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        const abs = normalizeUrl(href, BASE_URL);
        if (!abs) return;
        // Drop fragments and trailing query — canonical URL only
        const canonical = abs.split("#")[0].split("?")[0];
        // Skip the listing-page filter links if they happen to share the prefix
        if (!/\/event\/[^/]+\/?$/.test(canonical)) return;
        detailUrls.add(canonical);
      });

      if (detailUrls.size === beforeSize) {
        console.log(`[${this.config.cinemaId}] No new URLs on page ${page} — done.`);
        break;
      }
    }

    return detailUrls;
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    await FestivalDetector.preload();
    const screenings: RawScreening[] = [];

    // `parseScreeningDate` adds 1 year when a no-year date string compares
    // strictly before `referenceDate` — but it compares full Date timestamps,
    // so a 16:30-today screening (date at 00:00 UTC) loses to `new Date()`
    // and gets bumped to next year. Pin referenceDate to start-of-day UTC so
    // *today's* screenings are kept in the current year. `validate()` then
    // independently drops anything already past (s.datetime < now).
    const now = new Date();
    const referenceDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    for (const html of htmlPages) {
      screenings.push(...this.parseDetailPage(html, referenceDate));
    }
    console.log(`[${this.config.cinemaId}] Parsed ${screenings.length} screenings from ${htmlPages.length} pages`);
    return screenings;
  }

  /**
   * Parse one /event/<slug>/ detail page into 0+ RawScreening rows.
   * Public for unit tests.
   */
  parseDetailPage(html: string, now: Date): RawScreening[] {
    const $ = this.parseHtml(html);
    const screenings: RawScreening[] = [];

    // Title — DocHouse uses <h1> for the film/event title on the detail page.
    const filmTitle = $("h1").first().text().trim();
    if (!filmTitle) return [];

    // Each screening is an <a> whose href points to Curzon's seats endpoint.
    // The anchor text contains the date+time, e.g. "Fri 15th May 16:30".
    $('a[href*="/ticketing/seats/"]').each((_, el) => {
      const $a = $(el);
      const href = $a.attr("href") ?? "";
      const ticketMatch = href.match(TICKET_HREF_RE);
      if (!ticketMatch) return;

      const sourceId = `bertha-${ticketMatch[1]}`;
      const text = $a.text().trim().replace(/\s+/g, " ");
      if (!text) return;

      // Anchor text is "<weekday> <day><suffix> <month> <HH>:<MM>".
      // parseScreeningDate handles the date prefix; parseScreeningTime takes
      // the trailing HH:MM. We split on the last space-then-digit-pair.
      const timeMatch = text.match(/(\d{1,2}:\d{2})\s*$/);
      if (!timeMatch) return;
      const timeStr = timeMatch[1];
      const dateStr = text.slice(0, text.length - timeStr.length).trim();

      const datePart = parseScreeningDate(dateStr, now);
      const timePart = parseScreeningTime(timeStr);
      if (!datePart || !timePart) return;

      const datetime = combineDateAndTime(datePart, timePart);
      if (!datetime || isNaN(datetime.getTime())) return;

      screenings.push({
        filmTitle,
        datetime,
        bookingUrl: href.startsWith("http") ? href : normalizeUrl(href, BASE_URL) ?? "",
        sourceId,
      });
    });

    return screenings;
  }
}

export function createBerthaDochouseScraper(): BerthaDochouseScraper {
  return new BerthaDochouseScraper();
}
