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
 * 2. Fewer HTTP requests (14 pages vs 48+)
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

/** Number of days ahead to scrape from today */
const DAYS_AHEAD = 14;

export class BarbicanScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "barbican",
    baseUrl: "https://www.barbican.org.uk",
    requestsPerMinute: 6,
    delayBetweenRequests: 3000,
  };

  protected async fetchPages(): Promise<string[]> {
    const pages: string[] = [];
    const today = new Date();

    for (let i = 0; i < DAYS_AHEAD; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD

      const url = `${this.config.baseUrl}/whats-on/cinema?day=${dateStr}`;
      console.log(`[${this.config.cinemaId}] Fetching: ${url}`);

      try {
        const html = await this.fetchUrl(url);
        // Store the date and HTML together for parsing
        pages.push(JSON.stringify({ date: dateStr, html }));
      } catch (error) {
        console.error(`[${this.config.cinemaId}] Failed to fetch ${url}:`, error);
      }
    }

    console.log(`[${this.config.cinemaId}] Fetched ${pages.length} day pages`);
    return pages;
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    await FestivalDetector.preload();
    const screenings: RawScreening[] = [];

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
      }
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
            // Sold out: no booking link, time in a span like "6.30pm (Sold out)"
            const spanText = $instance.find("span").first().text().trim();
            const soldOutMatch = spanText.match(
              /(\d{1,2}\.\d{2}(?:am|pm))\s*\(Sold out\)/i
            );
            if (soldOutMatch) {
              timeText = soldOutMatch[1];
              soldOut = true;
            }
          }

          if (!timeText) return;

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

    return screenings;
  }
}

/** Creates a scraper for Barbican Cinema. */
export function createBarbicanScraper(): BarbicanScraper {
  return new BarbicanScraper();
}
