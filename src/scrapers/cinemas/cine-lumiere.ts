/**
 * Cine Lumiere (Institut Francais) Scraper
 * Scrapes film listings from the Savoy Systems booking page
 *
 * Cinema: Cine Lumiere at Institut Francais
 * Address: 17 Queensberry Place, South Kensington, London SW7 2DT
 * Website: https://www.institut-francais.org.uk/cine-lumiere/
 * Booking: https://cinelumiere.savoysystems.co.uk/CineLumiere.dll/
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { FestivalDetector } from "../festivals/festival-detector";
import {
  parseScreeningDate,
  parseScreeningTime,
  combineDateAndTime,
} from "../utils/date-parser";
import type { CheerioAPI } from "../utils/cheerio-types";

interface FilmPerformance {
  filmTitle: string;
  dateStr: string;
  timeStr: string;
  bookingUrl: string;
}

export class CineLumiereScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "cine-lumiere",
    baseUrl: "https://cinelumiere.savoysystems.co.uk",
    requestsPerMinute: 6,
    delayBetweenRequests: 2000,
  };

  protected async fetchPages(): Promise<string[]> {
    // The Savoy Systems page shows all current films and showtimes on a single page
    const url = `${this.config.baseUrl}/CineLumiere.dll/`;
    console.log(`[${this.config.cinemaId}] Fetching listings: ${url}`);

    const html = await this.fetchUrl(url);
    return [html];
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    await FestivalDetector.preload();
    const screenings: RawScreening[] = [];

    for (const html of htmlPages) {
      try {
        const $ = this.parseHtml(html);
        const performances = this.extractPerformances($);
        screenings.push(...performances);
      } catch (error) {
        console.error(`[${this.config.cinemaId}] Error parsing page:`, error);
      }
    }

    console.log(
      `[${this.config.cinemaId}] Found ${screenings.length} screenings total`
    );
    return screenings;
  }

  private extractPerformances($: CheerioAPI): RawScreening[] {
    const screenings: RawScreening[] = [];
    const now = new Date();

    // Each film is in a .programme or table structure
    // The Savoy Systems page uses tables with links containing TcsProgramme_ identifiers

    // Find all programme sections - these are typically table rows or divs with film info
    // Looking for links that contain "TcsProgramme_" which identify films
    const filmLinks = $('a[href*="TcsProgramme_"]');

    // Track unique films to avoid duplicates
    const processedFilms = new Set<string>();

    filmLinks.each((_, el) => {
      const $link = $(el);
      const filmTitle = this.cleanTitle($link.text().trim());

      if (!filmTitle || processedFilms.has(filmTitle)) return;
      processedFilms.add(filmTitle);

      // Find the parent container for this film to get all its performances
      // The structure is: film link -> parent container -> date/time info
      const $container = $link.closest("table, .programme, div").first();

      if ($container.length === 0) {
        // Try finding performances by looking ahead in the document
        this.parseFilmPerformancesFromSiblings($, $link, filmTitle, screenings, now);
      } else {
        this.parseFilmPerformances($, $container, filmTitle, screenings, now);
      }
    });

    // Alternative parsing: Look for the structure with dates and times directly
    // Savoy Systems shows: Date heading, then time links
    if (screenings.length === 0) {
      console.log(`[${this.config.cinemaId}] Trying alternative parsing approach...`);
      this.parseAlternativeStructure($, screenings, now);
    }

    return screenings;
  }

  private parseFilmPerformances(
    $: CheerioAPI,
    $container: ReturnType<CheerioAPI>,
    filmTitle: string,
    screenings: RawScreening[],
    now: Date
  ): void {
    // Find date elements - these are typically in their own rows/divs
    // Format: "Friday 6 Mar 2026" or similar

    let currentDate: Date | null = null;

    // Look for all text nodes and links within the container
    $container.find("*").each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();

      // Check if this is a date line (contains day name and date)
      const dateMatch = text.match(
        /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d{1,2}\s+\w+\s*\d*$/i
      );

      if (dateMatch) {
        currentDate = parseScreeningDate(text);
        return;
      }

      // Check if this is a time link (format: "16:00", "18:15", etc.)
      if ($el.is("a") && /^\d{1,2}:\d{2}$/.test(text)) {
        if (!currentDate) return;

        const time = parseScreeningTime(text);
        if (!time) return;

        const datetime = combineDateAndTime(currentDate, time);

        // Skip past screenings
        if (datetime < now) return;

        // Get booking URL
        const href = $el.attr("href") || "";
        const bookingUrl = href.startsWith("http")
          ? href
          : `${this.config.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

        screenings.push({
          filmTitle,
          datetime,
          bookingUrl: bookingUrl || `${this.config.baseUrl}/CineLumiere.dll/`,
          sourceId: `cine-lumiere-${filmTitle.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`,
          ...FestivalDetector.detect("cine-lumiere", filmTitle, datetime, bookingUrl),
        });
      }
    });
  }

  private parseFilmPerformancesFromSiblings(
    $: CheerioAPI,
    $filmLink: ReturnType<CheerioAPI>,
    filmTitle: string,
    screenings: RawScreening[],
    now: Date
  ): void {
    // For simpler page structures where film and performances are siblings
    let currentDate: Date | null = null;
    let $current = $filmLink.parent().next();

    // Walk through siblings until we hit another film link
    while ($current.length > 0 && $current.find('a[href*="TcsProgramme_"]').length === 0) {
      const text = $current.text().trim();

      // Check for date
      const dateMatch = text.match(
        /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d{1,2}\s+\w+\s*\d*/i
      );

      if (dateMatch) {
        currentDate = parseScreeningDate(text);
      }

      // Find time links
      $current.find("a").each((_, el) => {
        const $el = $(el);
        const timeText = $el.text().trim();

        if (/^\d{1,2}:\d{2}$/.test(timeText) && currentDate) {
          const time = parseScreeningTime(timeText);
          if (!time) return;

          const datetime = combineDateAndTime(currentDate, time);
          if (datetime < now) return;

          const href = $el.attr("href") || "";
          const bookingUrl = href.startsWith("http")
            ? href
            : `${this.config.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

          screenings.push({
            filmTitle,
            datetime,
            bookingUrl: bookingUrl || `${this.config.baseUrl}/CineLumiere.dll/`,
            sourceId: `cine-lumiere-${filmTitle.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`,
            ...FestivalDetector.detect("cine-lumiere", filmTitle, datetime, bookingUrl),
          });
        }
      });

      $current = $current.next();
    }
  }

  private parseAlternativeStructure(
    $: CheerioAPI,
    screenings: RawScreening[],
    now: Date
  ): void {
    // Parse the page looking for the pattern:
    // [Film Link] (Cert.XX)
    // Book Tickets
    // [Date]
    // [Time links]

    let currentFilm: string | null = null;
    let currentDate: Date | null = null;

    // Get all text and links in order
    $("body").find("a, td, tr").each((_, el) => {
      const $el = $(el);

      // Check for film link (contains TcsProgramme_)
      if ($el.is("a") && $el.attr("href")?.includes("TcsProgramme_")) {
        currentFilm = this.cleanTitle($el.text().trim());
        currentDate = null;
        return;
      }

      // Check for date text
      const text = $el.text().trim();
      const dateMatch = text.match(
        /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d{1,2}\s+\w+\s*\d*$/i
      );

      if (dateMatch && currentFilm) {
        currentDate = parseScreeningDate(text);
        return;
      }

      // Check for time link (format: "16:00")
      if ($el.is("a") && /^\d{1,2}:\d{2}$/.test(text)) {
        if (!currentFilm || !currentDate) return;

        const time = parseScreeningTime(text);
        if (!time) return;

        const datetime = combineDateAndTime(currentDate, time);
        if (datetime < now) return;

        const href = $el.attr("href") || "";
        const bookingUrl = href.startsWith("http")
          ? href
          : `${this.config.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

        // Check for "(Closed for Booking)" status
        const parentText = $el.parent().text();
        if (parentText.toLowerCase().includes("closed for booking")) {
          return;
        }

        screenings.push({
          filmTitle: currentFilm,
          datetime,
          bookingUrl: bookingUrl || `${this.config.baseUrl}/CineLumiere.dll/`,
          sourceId: `cine-lumiere-${currentFilm.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`,
          ...FestivalDetector.detect("cine-lumiere", currentFilm, datetime, bookingUrl),
        });
      }
    });

    if (screenings.length > 0) {
      console.log(
        `[${this.config.cinemaId}] Alternative parsing found ${screenings.length} screenings`
      );
    }
  }

  private cleanTitle(title: string): string {
    // Remove certificate ratings like (15), (12A), (PG), (U), (18), (TBC)
    return title
      .replace(/\s*\((?:U|PG|12A?|15|18|TBC)\)\s*/gi, "")
      .replace(/\s*Cert\.?\s*(?:U|PG|12A?|15|18|TBC)\s*/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}

export function createCineLumiereScraper(): CineLumiereScraper {
  return new CineLumiereScraper();
}
