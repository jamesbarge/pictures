/**
 * Close Up Cinema Scraper
 * Scrapes film listings from closeupfilmcentre.com
 *
 * Close Up Cinema (also known as Close-Up Film Centre) is a small independent cinema
 * in Shoreditch, East London, known for repertory programming and filmmaker seasons.
 *
 * The website embeds all screening data as JSON in a JavaScript variable:
 * var shows = [{...}, {...}]
 *
 * Structure:
 * - shows array contains screening objects with id, fp_id, title, blink, show_time, status, booking_availability, film_url
 * - show_time is in format "YYYY-MM-DD HH:MM:SS" (24-hour, already parsed)
 * - blink contains the TicketSource booking URL
 * - film_url contains the internal film page path
 */

import * as cheerio from "cheerio";
import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { FestivalDetector } from "../festivals/festival-detector";

interface CloseUpShow {
  id: string;
  fp_id: string;
  title: string;
  blink: string; // Booking URL (TicketSource)
  show_time: string; // Format: "YYYY-MM-DD HH:MM:SS"
  status: string;
  booking_availability: string;
  film_url: string;
}

export class CloseUpCinemaScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "close-up-cinema",
    baseUrl: "https://www.closeupfilmcentre.com",
    requestsPerMinute: 10,
    delayBetweenRequests: 1000,
  };

  protected async fetchPages(): Promise<string[]> {
    const pages: string[] = [];

    // Fetch the homepage first (has JSON data + immediate screenings)
    const homepageUrl = this.config.baseUrl;
    console.log(`[${this.config.cinemaId}] Fetching homepage: ${homepageUrl}`);
    const homepage = await this.fetchUrl(homepageUrl);
    pages.push(homepage);

    // Fetch future weeks using the date search endpoint
    // Format: /search_film_programmes/?date=DD-MM-YYYY
    const today = new Date();
    const weeksToFetch = 10; // Fetch ~10 weeks ahead

    for (let week = 1; week <= weeksToFetch; week++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + week * 7);

      const day = targetDate.getDate().toString().padStart(2, "0");
      const month = (targetDate.getMonth() + 1).toString().padStart(2, "0");
      const year = targetDate.getFullYear();

      const dateUrl = `${this.config.baseUrl}/search_film_programmes/?date=${day}-${month}-${year}`;
      console.log(`[${this.config.cinemaId}] Fetching week ${week}: ${dateUrl}`);

      try {
        const html = await this.fetchUrl(dateUrl);
        pages.push(html);
        // Respect rate limiting
        await this.delay(this.config.delayBetweenRequests);
      } catch (error) {
        console.warn(`[${this.config.cinemaId}] Failed to fetch ${dateUrl}:`, error);
      }
    }

    return pages;
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    await FestivalDetector.preload();
    const screenings: RawScreening[] = [];
    const now = new Date();
    const seenKeys = new Set<string>(); // For deduplication
    let jsonCount = 0;
    let htmlCount = 0;

    for (let i = 0; i < htmlPages.length; i++) {
      const html = htmlPages[i];
      const isHomepage = i === 0;

      // 1. Extract from JSON data (only on homepage)
      if (isHomepage) {
        const showsData = this.extractShowsJson(html);

        if (showsData && showsData.length > 0) {
          console.log(`[${this.config.cinemaId}] Found ${showsData.length} shows in JSON`);

          for (const show of showsData) {
            if (!show.title || !show.show_time) continue;
            if (show.status !== "1") continue;

            const datetime = this.parseDateTime(show.show_time);
            if (!datetime || isNaN(datetime.getTime())) continue;
            if (datetime < now) continue;

            let bookingUrl = show.blink;
            if (!bookingUrl && show.film_url) {
              bookingUrl = this.normalizeUrl(show.film_url);
            }
            if (!bookingUrl) continue;

            const sourceId = `close-up-${show.id}-${datetime.toISOString()}`;
            const dedupeKey = `${show.title.trim().toLowerCase()}-${datetime.toISOString()}`;

            if (!seenKeys.has(dedupeKey)) {
              seenKeys.add(dedupeKey);
              jsonCount++;
              screenings.push({
                filmTitle: show.title.trim(),
                datetime,
                bookingUrl,
                sourceId,
                ...FestivalDetector.detect("close-up-cinema", show.title.trim(), datetime, bookingUrl),
              });
            }
          }
        }
      }

      // 2. Extract from HTML listings (all pages)
      const pageHtmlScreenings = this.extractFromHtml(html, now, seenKeys);
      htmlCount += pageHtmlScreenings.length;
      screenings.push(...pageHtmlScreenings);
    }

    console.log(`[${this.config.cinemaId}] Found ${screenings.length} future screenings (JSON: ${jsonCount}, HTML: ${htmlCount})`);
    return screenings;
  }

  /**
   * Extract screenings from HTML listing blocks
   * Homepage format: "Thu 1 January, 8.15pm: Film Title" in h2 > a
   * Search page format: "04:30 pm : Film Title" in a > span
   */
  private extractFromHtml(html: string, now: Date, seenKeys: Set<string>): RawScreening[] {
    const screenings: RawScreening[] = [];
    const $ = cheerio.load(html);

    // 1. Homepage format: h2 with date/time and title
    $(".inner_block_3 h2 a").each((_, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr("href");

      // Parse format: "Thu 1 January, 8.15pm: Ten" or "Sun 4 January, 8pm: Taste of Cherry"
      const match = text.match(/^(\w+)\s+(\d+)\s+(\w+),?\s+(\d+)(?:[.:](\d+))?(am|pm):\s*(.+)$/i);
      if (!match) return;

      const [, , day, month, hour, minute = "0", ampm, title] = match;

      const datetime = this.parseHtmlDateTime(day, month, hour, minute, ampm);
      if (!datetime || datetime < now) return;

      const bookingUrl = href ? this.normalizeUrl(href) : null;
      if (!bookingUrl) return;

      const dedupeKey = `${title.trim().toLowerCase()}-${datetime.toISOString()}`;
      if (seenKeys.has(dedupeKey)) return;

      seenKeys.add(dedupeKey);
      const sourceId = `close-up-html-${datetime.toISOString()}-${title.replace(/\s+/g, "-").toLowerCase()}`;

      screenings.push({
        filmTitle: title.trim(),
        datetime,
        bookingUrl,
        sourceId,
        ...FestivalDetector.detect("close-up-cinema", title.trim(), datetime, bookingUrl),
      });
    });

    // 2. Search page format: "04:30 pm : Film Title" in spans
    // First, try to find the date from the page (look for date heading)
    const pageDate = this.extractPageDate(html);

    if (pageDate) {
      $("a span").each((_, el) => {
        const text = $(el).text().trim();
        const href = $(el).parent("a").attr("href");

        // Parse format: "04:30 pm : Film Title" or "08:00 pm : The Liberated Film Club: Jennifer Lucy Allan"
        const match = text.match(/^(\d{1,2}):(\d{2})\s*(am|pm)\s*:\s*(.+)$/i);
        if (!match) return;

        const [, hour, minute, ampm, title] = match;

        // Use the page date with the time from the listing
        const datetime = this.combineDateAndTime(pageDate, hour, minute, ampm);
        if (!datetime || datetime < now) return;

        const bookingUrl = href ? this.normalizeUrl(href) : null;
        if (!bookingUrl) return;

        const dedupeKey = `${title.trim().toLowerCase()}-${datetime.toISOString()}`;
        if (seenKeys.has(dedupeKey)) return;

        seenKeys.add(dedupeKey);
        const sourceId = `close-up-search-${datetime.toISOString()}-${title.replace(/\s+/g, "-").toLowerCase()}`;

        screenings.push({
          filmTitle: title.trim(),
          datetime,
          bookingUrl,
          sourceId,
          ...FestivalDetector.detect("close-up-cinema", title.trim(), datetime, bookingUrl),
        });
      });
    }

    return screenings;
  }

  /**
   * Extract the date from a search results page
   * Look for patterns like "Saturday, 31 January" in the page
   */
  private extractPageDate(html: string): Date | null {
    // Look for date in URL parameter first
    const urlMatch = html.match(/date=(\d{2})-(\d{2})-(\d{4})/);
    if (urlMatch) {
      const [, day, month, year] = urlMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }

    // Look for date heading like "Saturday, 31 January"
    const dateHeadingMatch = html.match(/(\w+),?\s+(\d{1,2})\s+(\w+)\s+(\d{4})?/);
    if (dateHeadingMatch) {
      const [, , day, month, year] = dateHeadingMatch;
      const months: Record<string, number> = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      };
      const monthNum = months[month.toLowerCase()];
      if (monthNum !== undefined) {
        const yearNum = year ? parseInt(year) : new Date().getFullYear();
        return new Date(yearNum, monthNum, parseInt(day));
      }
    }

    return null;
  }

  /**
   * Combine a date with time components
   */
  private combineDateAndTime(date: Date, hour: string, minute: string, ampm: string): Date {
    let hourNum = parseInt(hour, 10);
    const minuteNum = parseInt(minute, 10);

    // Convert to 24-hour
    if (ampm.toLowerCase() === "pm" && hourNum !== 12) {
      hourNum += 12;
    } else if (ampm.toLowerCase() === "am" && hourNum === 12) {
      hourNum = 0;
    }

    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hourNum, minuteNum, 0);
  }

  /**
   * Parse datetime from HTML format: "1", "January", "8", "15", "pm"
   */
  private parseHtmlDateTime(day: string, month: string, hour: string, minute: string, ampm: string): Date | null {
    const months: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    };

    const monthNum = months[month.toLowerCase()];
    if (monthNum === undefined) return null;

    let hourNum = parseInt(hour, 10);
    const minuteNum = parseInt(minute, 10);

    // Convert to 24-hour
    if (ampm.toLowerCase() === "pm" && hourNum !== 12) {
      hourNum += 12;
    } else if (ampm.toLowerCase() === "am" && hourNum === 12) {
      hourNum = 0;
    }

    // Determine year - if month is in the past, assume next year
    const now = new Date();
    let year = now.getFullYear();
    const testDate = new Date(year, monthNum, parseInt(day, 10));
    if (testDate < now) {
      year++;
    }

    return new Date(year, monthNum, parseInt(day, 10), hourNum, minuteNum, 0);
  }

  /**
   * Extract the shows JSON array from the page HTML
   * The site uses: var shows ='[{...}]'; (JSON string wrapped in single quotes)
   * NOT: var shows = [{...}]; (direct JSON array)
   */
  private extractShowsJson(html: string): CloseUpShow[] | null {
    // The site wraps JSON in single quotes as a string: var shows ='[...]';
    // This pattern extracts the JSON string content
    const stringPattern = /var\s+shows\s*=\s*'(\[[\s\S]*?\])'\s*;/;
    const stringMatch = html.match(stringPattern);

    if (stringMatch && stringMatch[1]) {
      try {
        // The JSON has escaped forward slashes (\/), which is valid JSON
        const parsed = JSON.parse(stringMatch[1]);
        if (Array.isArray(parsed)) {
          console.log(`[${this.config.cinemaId}] Extracted ${parsed.length} shows from JSON string`);
          return parsed as CloseUpShow[];
        }
      } catch (e) {
        console.log(`[${this.config.cinemaId}] Failed to parse shows JSON string:`, e);
      }
    }

    // Fallback: Try direct JSON array patterns (in case site format changes)
    const directPatterns = [
      /var\s+shows\s*=\s*(\[[\s\S]*?\]);/,
      /let\s+shows\s*=\s*(\[[\s\S]*?\]);/,
      /const\s+shows\s*=\s*(\[[\s\S]*?\]);/,
    ];

    for (const pattern of directPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (Array.isArray(parsed)) {
            return parsed as CloseUpShow[];
          }
        } catch {
          // Continue to next pattern
        }
      }
    }

    console.log(`[${this.config.cinemaId}] Could not find shows variable in page`);
    return null;
  }

  /**
   * Parse datetime from "YYYY-MM-DD HH:MM:SS" format
   */
  private parseDateTime(dateTimeStr: string): Date | null {
    if (!dateTimeStr) {
      return null;
    }

    // Format: "2025-12-28 14:00:00"
    // Split into date and time parts
    const parts = dateTimeStr.trim().split(" ");
    if (parts.length !== 2) {
      return null;
    }

    const [datePart, timePart] = parts;

    // Parse date: YYYY-MM-DD
    const dateMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) {
      return null;
    }

    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1; // JS months are 0-indexed
    const day = parseInt(dateMatch[3], 10);

    // Parse time: HH:MM:SS
    const timeMatch = timePart.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (!timeMatch) {
      return null;
    }

    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = parseInt(timeMatch[3], 10);

    return new Date(year, month, day, hours, minutes, seconds);
  }

  /**
   * Normalize URL - ensure it's absolute
   */
  private normalizeUrl(url: string): string {
    if (url.startsWith("http")) {
      return url;
    }
    if (url.startsWith("/")) {
      return `${this.config.baseUrl}${url}`;
    }
    return `${this.config.baseUrl}/${url}`;
  }
}

export function createCloseUpCinemaScraper(): CloseUpCinemaScraper {
  return new CloseUpCinemaScraper();
}
