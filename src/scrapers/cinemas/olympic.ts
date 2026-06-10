/**
 * Olympic Studios Cinema Scraper
 *
 * Cinema: Olympic Studios (Barnes)
 * Address: 117-123 Church Road, Barnes, London SW13 9HL
 * Website: https://www.olympiccinema.com
 *
 * Uses Empire/MyCloudCinema booking system
 * HTML structure: Date headers with film cards containing showtime buttons
 * Cheerio-based scraper - suitable for serverless cloud execution
 */

import { getYear } from "date-fns";

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import {
  combineDateAndTime,
  parseScreeningDate,
} from "../utils/date-parser";

export class OlympicScraper extends BaseScraper {
  config: ScraperConfig = {
    // Canonical registry id is "olympic-studios" ("olympic" is a legacyId).
    // The registry path injects the canonical venue id, but the standalone
    // run-olympic-v2.ts runner uses this config id directly — so it MUST be the
    // canonical id or standalone runs create a duplicate `olympic` cinema row.
    cinemaId: "olympic-studios",
    baseUrl: "https://www.olympiccinema.com",
    requestsPerMinute: 10,
    delayBetweenRequests: 1000,
  };

  protected async fetchPages(): Promise<string[]> {
    const url = `${this.config.baseUrl}/whats-on`;
    console.log(`[${this.config.cinemaId}] Fetching whats-on page: ${url}`);

    const html = await this.fetchUrl(url);
    return [html];
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const screenings: RawScreening[] = [];
    const $ = this.parseHtml(htmlPages[0]);
    const now = new Date();
    const currentYear = getYear(now);

    // Find all date headers
    const dateHeaders = $("h3.date-day");
    console.log(`[${this.config.cinemaId}] Found ${dateHeaders.length} date headers`);

    dateHeaders.each((_, dateHeader) => {
      const dateText = $(dateHeader).text().trim();
      // Parse date like "Tuesday December 30" - add year
      const dateMatch = dateText.match(
        /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+([A-Za-z]+)\s+(\d{1,2})/i
      );
      if (!dateMatch) {
        console.warn(`[${this.config.cinemaId}] Failed to parse date: ${dateText}`);
        return;
      }
      const [, month, day] = dateMatch;
      const dateWithYear = `${day} ${month} ${currentYear}`;
      let parsedDate: Date;

      try {
        const currentYearDate = parseScreeningDate(dateWithYear, now);
        if (!currentYearDate) throw new Error("Invalid date");
        parsedDate = currentYearDate;

        // Handle year rollover (e.g., if we're in December and the date is January)
        if (parsedDate < now && parsedDate.getUTCMonth() < now.getUTCMonth()) {
          const nextYearDate = parseScreeningDate(`${day} ${month} ${currentYear + 1}`, now);
          if (!nextYearDate) throw new Error("Invalid rollover date");
          parsedDate = nextYearDate;
        }
      } catch {
        console.warn(`[${this.config.cinemaId}] Failed to parse date: ${dateText}`);
        return;
      }

      // Find the next sibling row container which holds all films for this date
      const filmsContainer = $(dateHeader).next(".row");

      // Each film is in a col-md-12 div
      filmsContainer.find(".col-md-12").each((_, filmDiv) => {
        // Find film title link
        const titleLink = $(filmDiv).find("a.text-decoration-none.text-black");
        const filmTitle = titleLink.text().trim();

        if (!filmTitle) return;

        // Find all showtime buttons for this film
        $(filmDiv).find("a.btn").each((_, btn) => {
          const href = $(btn).attr("href") || "";

          // Only process Empire/MyCloudCinema booking links
          if (!href.includes("empire.mycloudcinema.com")) return;

          // Extract time from btn-times-fs span
          const timeText = $(btn).find(".btn-times-fs").text().trim();
          if (!timeText) return;

          const [hours, minutes] = timeText.split(":").map(Number);
          if (isNaN(hours) || isNaN(minutes)) return;

          // Create datetime
          const datetime = combineDateAndTime(parsedDate, { hours, minutes });

          // Skip past screenings
          if (datetime < now) return;

          // Create source ID from booking URL
          const bookingId = href.match(/book\/(\d+)/)?.[1] || "";
          const sourceId = `olympic-${bookingId}-${datetime.toISOString()}`;

          screenings.push({
            filmTitle,
            datetime,
            bookingUrl: href,
            sourceId,
          });
        });
      });
    });

    console.log(`[${this.config.cinemaId}] Found ${screenings.length} screenings`);
    return screenings;
  }
}

/** Creates an Olympic Cinema scraper (Cheerio-based, extends BaseScraper). */
export function createOlympicScraper(): OlympicScraper {
  return new OlympicScraper();
}
