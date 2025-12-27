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

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";

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
    // Close Up Cinema has all screening data embedded as JSON on the homepage
    const url = this.config.baseUrl;
    console.log(`[${this.config.cinemaId}] Fetching homepage: ${url}`);

    const html = await this.fetchUrl(url);
    return [html];
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const screenings: RawScreening[] = [];
    const html = htmlPages[0];

    // Extract the shows JSON from the page
    // Format: var shows = [{...}, {...}];
    const showsData = this.extractShowsJson(html);

    if (!showsData || showsData.length === 0) {
      console.log(`[${this.config.cinemaId}] No shows data found on page`);
      return [];
    }

    console.log(`[${this.config.cinemaId}] Found ${showsData.length} shows in JSON`);

    const now = new Date();

    for (const show of showsData) {
      // Skip if no title or showtime
      if (!show.title || !show.show_time) {
        continue;
      }

      // Skip if status indicates not active
      if (show.status !== "1") {
        continue;
      }

      // Parse the datetime - format is "YYYY-MM-DD HH:MM:SS"
      const datetime = this.parseDateTime(show.show_time);

      if (!datetime || isNaN(datetime.getTime())) {
        console.warn(
          `[${this.config.cinemaId}] Invalid datetime: ${show.show_time} for "${show.title}"`
        );
        continue;
      }

      // Skip past screenings
      if (datetime < now) {
        continue;
      }

      // Validate time - cinema screenings should typically be 10:00-23:59
      const hours = datetime.getHours();
      if (hours < 10 && hours !== 0) {
        console.warn(
          `[${this.config.cinemaId}] Unusual early time: ${show.show_time} for "${show.title}" - verify this is correct`
        );
      }

      // Build booking URL - prefer TicketSource link if available
      let bookingUrl = show.blink;
      if (!bookingUrl && show.film_url) {
        // Fallback to film page if no direct booking link
        bookingUrl = this.normalizeUrl(show.film_url);
      }

      if (!bookingUrl) {
        console.warn(`[${this.config.cinemaId}] No booking URL for "${show.title}"`);
        continue;
      }

      // Create sourceId for deduplication
      const sourceId = `close-up-${show.id}-${datetime.toISOString()}`;

      screenings.push({
        filmTitle: show.title.trim(),
        datetime,
        bookingUrl,
        sourceId,
      });
    }

    console.log(`[${this.config.cinemaId}] Found ${screenings.length} future screenings`);
    return screenings;
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
