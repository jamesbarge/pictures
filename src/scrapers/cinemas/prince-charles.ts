/**
 * Prince Charles Cinema Scraper
 * Scrapes film listings from princecharlescinema.com
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { parseScreeningDate, parseScreeningTime, combineDateAndTime } from "../utils/date-parser";
import type { CheerioAPI, CheerioSelection } from "../utils/cheerio-types";

export class PrinceCharlesScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "prince-charles",
    baseUrl: "https://princecharlescinema.com",
    requestsPerMinute: 10,
    delayBetweenRequests: 2000,
  };

  protected async fetchPages(): Promise<string[]> {
    const url = `${this.config.baseUrl}/whats-on/`;
    console.log(`[${this.config.cinemaId}] Fetching: ${url}`);

    const html = await this.fetchUrl(url);
    console.log(`[${this.config.cinemaId}] Got ${html.length} bytes`);
    return [html];
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const screenings: RawScreening[] = [];

    for (const html of htmlPages) {
      const $ = this.parseHtml(html);

      // Each film is in a .jacro-event.movie-tabs container
      $(".jacro-event.movie-tabs").each((_, filmEl) => {
        try {
          const $film = $(filmEl);
          const filmScreenings = this.parseFilmBlock($, $film);
          screenings.push(...filmScreenings);
        } catch (error) {
          console.error(`[${this.config.cinemaId}] Error parsing film:`, error);
        }
      });

      console.log(`[${this.config.cinemaId}] Found ${screenings.length} screenings`);
    }

    return screenings;
  }

  private parseFilmBlock($: CheerioAPI, $film: CheerioSelection): RawScreening[] {
    const screenings: RawScreening[] = [];

    // Get film title
    const title = $film.find(".liveeventtitle").first().text().trim();
    if (!title) return screenings;

    // Detect format from film classes
    const filmClasses = $film.attr("class") || "";
    let defaultFormat: string | undefined;
    if (filmClasses.includes("35mm")) defaultFormat = "35mm";
    else if (filmClasses.includes("70mm")) defaultFormat = "70mm";

    // Parse showtimes from performance-list-items
    // Structure: <ul><div class="heading">Date</div><li>showtime</li><li>showtime</li><div class="heading">Date</div>...</ul>
    let currentDate: Date | null = null;

    $film.find(".performance-list-items").children().each((_: number, el: CheerioSelection) => {
      const $el = $(el);
      const tagName = (el as { tagName: string }).tagName.toLowerCase();

      if (tagName === "div" && $el.hasClass("heading")) {
        // Date header like "Friday 19th December"
        const dateText = $el.text().trim();
        currentDate = parseScreeningDate(dateText);
      } else if (tagName === "li" && currentDate) {
        // Showtime entry
        const screening = this.parseShowtimeLi($, $el, title, currentDate, defaultFormat);
        if (screening) {
          screenings.push(screening);
        }
      }
    });

    return screenings;
  }

  private parseShowtimeLi(
    $: CheerioAPI,
    $li: CheerioSelection,
    filmTitle: string,
    date: Date,
    defaultFormat?: string
  ): RawScreening | null {
    // Get the booking link
    const $bookLink = $li.find("a.film_book_button");
    let bookingUrl = $bookLink.attr("href");

    // Skip sold out shows (they have class soldfilm_book_button)
    if ($bookLink.hasClass("soldfilm_book_button") || !bookingUrl) {
      return null;
    }

    // Ensure booking URL is absolute
    if (!bookingUrl.startsWith("http")) {
      bookingUrl = `${this.config.baseUrl}${bookingUrl.startsWith("/") ? "" : "/"}${bookingUrl}`;
    }

    // Get time from span.time inside the link
    const timeText = $bookLink.find("span.time").text().trim();
    const time = parseScreeningTime(timeText);

    if (!time) {
      return null;
    }

    const datetime = combineDateAndTime(date, time);

    // Check li classes for format
    const liClasses = $li.attr("class") || "";
    let format = defaultFormat;
    if (liClasses.includes("35mm")) format = "35mm";
    else if (liClasses.includes("70mm")) format = "70mm";

    // Check for event type
    let eventType: string | undefined;
    if (liClasses.includes("sing-along")) eventType = "singalong";
    else if (liClasses.includes("q-and-a")) eventType = "q_and_a";
    else if (liClasses.includes("unreserved")) eventType = undefined; // Not really an event type

    return {
      filmTitle,
      datetime,
      bookingUrl,
      format,
      eventType,
      sourceId: bookingUrl.match(/booknow\/(\d+)/)?.[1],
    };
  }
}

export function createPrinceCharlesScraper(): PrinceCharlesScraper {
  return new PrinceCharlesScraper();
}
