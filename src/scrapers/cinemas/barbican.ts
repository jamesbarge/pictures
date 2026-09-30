/**
 * Barbican Cinema Scraper
 *
 * Strategy: Scrape the daily cinema listing page at /whats-on/cinema?day=YYYY-MM-DD
 * which shows ALL cinema screenings for a given day across every series (New Releases,
 * Cold War Visions, Relaxed Screenings, London Soundtrack Festival, etc.).
 *
 * This is much more reliable than the old approach of scraping /whats-on/series/new-releases
 * then fetching individual film pages and performance endpoints, because:
 * 1. It covers ALL cinema series, not just "new-releases"
 * 2. One request per day, flat in the horizon — the old approach paid a page
 *    fetch per film plus a performances endpoint per film on top of the series page
 * 3. All data (title, time, booking URL) is on one page per day
 * 4. No fragile node ID extraction step
 *
 * Each day page contains .cinema-listing-card elements with film titles and
 * .cinema-instance-list__instance elements with showtimes and booking links.
 * Times are displayed in UK local format like "12.00pm", "5.55pm".
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import type { CheerioAPI } from "../utils/cheerio-types";
import { parseScreeningTime, ukLocalToUTC } from "../utils/date-parser";
import { FestivalDetector } from "../festivals/festival-detector";

/**
 * Number of days ahead to scrape from today (London calendar days).
 *
 * The `?day=` endpoint accepts any date and answers 200 well past this — probed
 * 2026-08-09, every day from today to +145 returned 200 and the furthest listing
 * was 2026-11-22 (~105 days out). 70 is the product target (~2 months) and each
 * day costs one sequential request, so raising it further multiplies traffic for
 * coverage nobody asked for. Was 30, which capped the venue at ~28 days.
 */
const DAYS_AHEAD = 70;

/**
 * Attempts per day page. One retry is enough to absorb the isolated 5xx /
 * connection reset that would otherwise abort the whole 70-request walk and
 * write zero Barbican screenings for the night (fetchPages fails loud by design
 * — see the failures check below — so a single blip used to cost the venue its
 * entire run).
 */
const FETCH_ATTEMPTS = 2;

/** Backoff between attempts on the same day page. */
const RETRY_BACKOFF_MS = 4_000;

/** Emit a progress line every N day pages instead of one line per request. */
const PROGRESS_EVERY = 10;

/**
 * YYYY-MM-DD in Europe/London, `offset` calendar days after `from`'s London
 * date. Anchors the arithmetic at NOON UTC (13:00 London in BST — always inside
 * the same calendar day) so stepping never skips or duplicates a day across a
 * BST↔GMT transition.
 *
 * Replaces `new Date().toISOString().split("T")[0]` plus `setDate()`, which read
 * the *UTC* date: run between 23:00 and 00:00 London during BST it started the
 * walk on yesterday, wasting a request on a day whose screenings are all in the
 * past and shaving a day off the far end.
 *
 * (`src/scrapers/platforms/indy.ts` carries a private copy of this helper;
 * consolidating the two into `utils/date-parser.ts` is a follow-up.)
 */
function londonDateKey(from: Date, offset: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(from);
  const num = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  // Date.UTC normalizes day-of-month overflow (e.g. day 32 → next month).
  const anchored = new Date(Date.UTC(num("year"), num("month") - 1, num("day") + offset, 12));
  const yyyy = anchored.getUTCFullYear();
  const mm = String(anchored.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(anchored.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export class BarbicanScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "barbican",
    baseUrl: "https://www.barbican.org.uk",
    requestsPerMinute: 6,
    delayBetweenRequests: 3000,
  };

  protected async fetchPages(): Promise<string[]> {
    const pages: string[] = [];
    const now = new Date();

    for (let i = 0; i < DAYS_AHEAD; i++) {
      const dateStr = londonDateKey(now, i);
      const url = `${this.config.baseUrl}/whats-on/cinema?day=${dateStr}`;

      const html = await this.fetchDayPage(url);

      // Abort on the FIRST day page that exhausts its retries.
      //
      // This batch is all-or-nothing, and deliberately so: a missing day page
      // makes that day's screenings absent from the batch, and
      // cleanupSupersededScreenings would then read those live rows as
      // superseded and DELETE them. PR #742's guard covers failed *writes*, not
      // under-scraped *input*, so a partial window is a data-loss path rather
      // than merely a short horizon.
      //
      // Because of that, continuing past a hard failure can never produce a
      // successful run — it only decides how many requests get wasted first.
      // A `MAX_CONSECUTIVE_FAILURES = 3` tolerance used to live here, but each
      // success reset it, so an alternating fail/ok site made all 70 day
      // requests plus 35 retries and discarded every one, at up to 70s per
      // failing day — enough to breach VENUE_TIMEOUT_MS (600s) against a ~223s
      // happy path. Transient blips are still absorbed one layer down, inside
      // fetchDayPage's FETCH_ATTEMPTS retry, which is the right place for them.
      if (html === null) {
        throw new Error(
          `Failed to fetch Barbican day page ${url} after ${FETCH_ATTEMPTS} attempts ` +
            `(day ${i + 1}/${DAYS_AHEAD}) — aborting rather than persisting a partial window`
        );
      }

      // Store the date and HTML together for parsing
      pages.push(JSON.stringify({ date: dateStr, html }));

      if ((i + 1) % PROGRESS_EVERY === 0 || i === DAYS_AHEAD - 1) {
        console.log(
          `[${this.config.cinemaId}] fetched ${i + 1}/${DAYS_AHEAD} day pages (through ${dateStr})`
        );
      }
    }

    // Belt and braces: the loop throws on any hard failure, so reaching here
    // with a short page list would mean the walk itself is wrong.
    if (pages.length !== DAYS_AHEAD) {
      throw new Error(
        `Barbican walk produced ${pages.length}/${DAYS_AHEAD} day pages — ` +
          `refusing to persist a partial window`
      );
    }

    console.log(`[${this.config.cinemaId}] Fetched ${pages.length} day pages`);
    return pages;
  }

  /**
   * Fetch one day page, retrying a transient failure. Returns null when every
   * attempt failed, leaving the caller to decide whether that ends the run.
   */
  private async fetchDayPage(url: string): Promise<string | null> {
    for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
      try {
        return await this.fetchUrl(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const lastAttempt = attempt === FETCH_ATTEMPTS;
        console.error(
          `[${this.config.cinemaId}] fetch ${attempt}/${FETCH_ATTEMPTS} failed for ${url}: ${message}` +
            (lastAttempt ? " (giving up)" : " (retrying)")
        );
        if (!lastAttempt) await this.delay(RETRY_BACKOFF_MS);
      }
    }
    return null;
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    await FestivalDetector.preload();
    const screenings: RawScreening[] = [];
    let failures = 0;

    for (const page of htmlPages) {
      try {
        const { date, html } = JSON.parse(page);
        const $ = this.parseHtml(html);

        const dayScreenings = this.parseDayPage($, date);
        screenings.push(...dayScreenings);

        if (dayScreenings.length > 0) {
          console.log(`[${this.config.cinemaId}] ${date}: ${dayScreenings.length} screenings`);
        }
      } catch (error) {
        console.error(`[${this.config.cinemaId}] Error parsing day page:`, error);
        failures++;
      }
    }

    if (failures > 0) {
      throw new Error(`Failed to parse ${failures}/${htmlPages.length} Barbican day pages`);
    }

    console.log(`[${this.config.cinemaId}] Found ${screenings.length} screenings total`);
    return screenings;
  }

  /**
   * Parse a single day's cinema listing page.
   *
   * Structure:
   *   .cinema-listing-card
   *     .cinema-listing-card__title > a[href]  (film title + event URL)
   *     .cinema-listing-card__instances
   *       .cinema-instance-list__instance
   *         a[href*="tickets.barbican"]  (booking link with time text like "12.00pm")
   *         — OR for sold-out screenings —
   *         span containing "X.XXpm (Sold out)"
   */
  private parseDayPage($: CheerioAPI, dateStr: string): RawScreening[] {
    const screenings: RawScreening[] = [];
    const [year, month, day] = dateStr.split("-").map(Number);
    /**
     * Showtime instances we could read no time from. Measured 0 across 12 days
     * sampled between +0 and +69 on 2026-08-09, so anything here means the
     * booking-link or sold-out markup moved and screenings are being dropped
     * silently — which is how a venue quietly loses coverage.
     */
    const unreadableInstances: string[] = [];

    $(this.getSelector("filmCard", ".cinema-listing-card")).each((_, cardEl) => {
      const $card = $(cardEl);

      // Extract film title and event URL
      const titleLink = $card.find(
        this.getSelector("titleLink", ".cinema-listing-card__title a")
      );
      const rawTitle = titleLink.text().trim();
      const eventHref = titleLink.attr("href") || "";

      if (!rawTitle) return;

      // Clean title: normalize whitespace and strip BBFC ratings
      const title = rawTitle
        .replace(/\s+/g, " ")
        .replace(/\s*\((U|PG|12A?|15|18)\*?\)\s*$/i, "")
        .trim();

      // Build the event page URL for fallback booking links
      const eventUrl = eventHref.startsWith("http")
        ? eventHref
        : `${this.config.baseUrl}${eventHref}`;

      // Parse each showtime instance within this film card
      $card
        .find(this.getSelector("instance", ".cinema-instance-list__instance"))
        .each((_, instanceEl) => {
          const $instance = $(instanceEl);

          // Try to get time from booking link first (preferred — has href for booking URL)
          const bookingLink = $instance.find('a[href*="tickets.barbican"], a[href*="choose-seats"]');
          let timeText: string | null = null;
          let bookingUrl: string | null = null;
          let soldOut = false;

          if (bookingLink.length > 0) {
            // The link text contains the time, e.g. "12.00pm"
            timeText = bookingLink.text().trim();
            bookingUrl = bookingLink.attr("href") || null;
          } else {
            // Sold out: no booking link, time in a span like "6.30pm (Sold out)".
            // Read the FULL instance text, not .find("span").first(): per
            // .claude/rules/scrapers.md, time parsing must use full element text.
            // If Barbican ever prepends a badge span ("CAP", "Relaxed") inside the
            // instance, .first() would return the badge, the regex would miss, and
            // EVERY sold-out screening would silently drop.
            const spanText = $instance.text().replace(/\s+/g, " ").trim();
            const soldOutMatch = spanText.match(
              /(\d{1,2}\.\d{2}(?:am|pm))\s*\(Sold out\)/i
            );
            if (soldOutMatch) {
              timeText = soldOutMatch[1];
              soldOut = true;
            }
          }

          if (!timeText) {
            unreadableInstances.push(
              `${title}: ${$instance.text().replace(/\s+/g, " ").trim().slice(0, 80)}`
            );
            return;
          }

          // Parse time — Barbican uses dot separator: "12.00pm", "5.55pm"
          // Convert dot to colon for the shared parser: "12:00pm", "5:55pm"
          const normalizedTime = timeText.replace(".", ":");
          const parsedTime = parseScreeningTime(normalizedTime);

          if (!parsedTime) {
            console.warn(
              `[${this.config.cinemaId}] Could not parse time "${timeText}" for ${title}`
            );
            return;
          }

          // Warn about suspiciously early times
          if (parsedTime.hours < 10) {
            console.warn(
              `[${this.config.cinemaId}] Suspiciously early time ${parsedTime.hours}:${String(parsedTime.minutes).padStart(2, "0")} for ${title} — check parse`
            );
          }

          // Construct UTC datetime from UK local time
          // month is 0-indexed for ukLocalToUTC, dateStr month is 1-indexed
          const datetime = ukLocalToUTC(year, month - 1, day, parsedTime.hours, parsedTime.minutes);

          // Build a unique source ID from date + time + title slug
          const titleSlug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 40);
          const sourceId = `barbican-${dateStr}-${String(parsedTime.hours).padStart(2, "0")}${String(parsedTime.minutes).padStart(2, "0")}-${titleSlug}`;

          // Fall back to event page URL if no booking link (sold out)
          const finalBookingUrl = bookingUrl || eventUrl;

          screenings.push({
            filmTitle: title,
            datetime,
            bookingUrl: finalBookingUrl,
            sourceId,
            availabilityStatus: soldOut ? "sold_out" : "available",
            ...FestivalDetector.detect("barbican", title, datetime, finalBookingUrl),
          });
        });
    });

    if (unreadableInstances.length > 0) {
      console.warn(
        `[${this.config.cinemaId}] ${dateStr}: ${unreadableInstances.length} showtime instance(s) with no readable time — ` +
          `booking-link/sold-out markup may have changed. Samples: ${unreadableInstances.slice(0, 3).join(" | ")}`
      );
    }

    return screenings;
  }
}

/** Creates a scraper for Barbican Cinema. */
export function createBarbicanScraper(): BarbicanScraper {
  return new BarbicanScraper();
}
