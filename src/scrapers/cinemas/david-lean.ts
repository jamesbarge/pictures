/**
 * David Lean Cinema Scraper
 *
 * Cinema: The David Lean Cinema (Croydon Clocktower)
 * Address: Katharine Street, Croydon CR9 1ET
 * Website: https://www.davidleancinema.org.uk
 *
 * Uses TicketSolve for booking (via tinyurl redirects)
 * WordPress site with Elementor - film cards in figure elements
 * Cheerio-based scraper - suitable for serverless cloud execution
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { parse, getYear, addYears } from "date-fns";

export class DavidLeanScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "david-lean-cinema",
    baseUrl: "https://www.davidleancinema.org.uk",
    requestsPerMinute: 10,
    delayBetweenRequests: 1000,
  };

  protected async fetchPages(): Promise<string[]> {
    const url = `${this.config.baseUrl}/listings`;
    console.log(`[${this.config.cinemaId}] Fetching listings page: ${url}`);

    const html = await this.fetchUrl(url);
    return [html];
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const screenings: RawScreening[] = [];
    const $ = this.parseHtml(htmlPages[0]);
    const now = new Date();
    const currentYear = getYear(now);

    // Find all figure elements with film data
    const figures = $("figure.wp-caption");
    console.log(`[${this.config.cinemaId}] Found ${figures.length} film figures`);

    figures.each((_, figure) => {
      const $figure = $(figure);

      // Get film title from image alt attribute
      const filmTitle = $figure.find("img").attr("alt")?.trim();
      if (!filmTitle) return;

      // Get booking URL from the link
      const bookingUrl = $figure.find("a").attr("href") || "";
      if (!bookingUrl) return;

      // Get date/time from figcaption
      // Format: "Tues 06 Jan at 11am (DF)" or "Tues 06 Jan at 2.30pm and 7.30pm (HOH)"
      const captionText = $figure.find("figcaption").text().trim();
      if (!captionText) return;

      // Parse the caption to extract dates and times
      const parsedScreenings = this.parseCaptionToScreenings(
        filmTitle,
        captionText,
        bookingUrl,
        currentYear,
        now
      );

      screenings.push(...parsedScreenings);
    });

    console.log(`[${this.config.cinemaId}] Found ${screenings.length} screenings`);
    return screenings;
  }

  private parseCaptionToScreenings(
    filmTitle: string,
    caption: string,
    bookingUrl: string,
    currentYear: number,
    now: Date
  ): RawScreening[] {
    const screenings: RawScreening[] = [];

    // Remove annotations like (DF), (HOH), (BIA) - these are accessibility notes
    const cleanCaption = caption.replace(/\s*\([A-Z]+\)\s*/g, " ").trim();

    // Match pattern: "Day DD Mon at HH:MM" with optional "and HH:MM"
    // Examples: "Tues 06 Jan at 11am", "Tues 06 Jan at 2.30pm and 7.30pm"
    const simpleMatch = cleanCaption.match(/(\w+)\s+(\d{1,2})\s+(\w+)\s+at\s+(.+)/i);
    if (!simpleMatch) return screenings;

    const [, dayName, dayNum, monthName, timePart] = simpleMatch;
    const times = this.extractTimes(timePart);

    for (const time of times) {
      try {
        const datetime = this.parseDateTime(dayName, dayNum, monthName, time, currentYear);
        const adjustedDatetime = datetime < now ? addYears(datetime, 1) : datetime;

        if (adjustedDatetime >= now) {
          screenings.push({
            filmTitle,
            datetime: adjustedDatetime,
            bookingUrl,
            sourceId: `david-lean-${filmTitle.toLowerCase().replace(/\s+/g, "-")}-${adjustedDatetime.toISOString()}`,
          });
        }
      } catch {
        // Skip on error
      }
    }

    return screenings;
  }

  private extractTimes(timePart: string): string[] {
    // Handle "11am", "2.30pm", "2.30pm and 7.30pm"
    const times: string[] = [];
    const timePattern = /(\d{1,2}(?:\.\d{2})?(?:am|pm))/gi;

    let match;
    while ((match = timePattern.exec(timePart)) !== null) {
      times.push(match[1]);
    }

    return times;
  }

  private parseDateTime(
    dayName: string,
    dayNum: string,
    monthName: string,
    timeStr: string,
    currentYear: number
  ): Date {
    // Normalize time format: "2.30pm" -> "14:30", "11am" -> "11:00"
    const normalizedTime = this.normalizeTime(timeStr);
    const [hours, minutes] = normalizedTime.split(":").map(Number);

    // Parse date
    const dateStr = `${dayNum} ${monthName} ${currentYear}`;
    const parsedDate = parse(dateStr, "d MMM yyyy", new Date());

    parsedDate.setHours(hours, minutes, 0, 0);
    return parsedDate;
  }

  private normalizeTime(timeStr: string): string {
    // Convert "2.30pm" or "2pm" to "14:30" or "14:00"
    const match = timeStr.toLowerCase().match(/(\d{1,2})(?:\.(\d{2}))?(am|pm)/);
    if (!match) return "00:00";

    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const period = match[3];

    if (period === "pm" && hours !== 12) {
      hours += 12;
    } else if (period === "am" && hours === 12) {
      hours = 0;
    }

    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }
}

export function createDavidLeanScraper(): DavidLeanScraper {
  return new DavidLeanScraper();
}
