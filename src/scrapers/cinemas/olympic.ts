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

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { parse, getYear } from "date-fns";

export class OlympicScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "olympic",
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
      const dateWithYear = `${dateText} ${currentYear}`;
      let parsedDate: Date;

      try {
        parsedDate = parse(dateWithYear, "EEEE MMMM d yyyy", new Date());

        // Handle year rollover (e.g., if we're in December and the date is January)
        if (parsedDate < now && parsedDate.getMonth() < now.getMonth()) {
          parsedDate = parse(`${dateText} ${currentYear + 1}`, "EEEE MMMM d yyyy", new Date());
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

          // Parse time (format: "15:30")
          const [hours, minutes] = timeText.split(":").map(Number);
          if (isNaN(hours) || isNaN(minutes)) return;

          // Create datetime
          const datetime = new Date(parsedDate);
          datetime.setHours(hours, minutes, 0, 0);

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

export function createOlympicScraper(): OlympicScraper {
  return new OlympicScraper();
}
