/**
 * Rio Cinema Scraper
 * Scrapes film listings from riocinema.org.uk
 *
 * Rio Cinema embeds all event data as JSON in the page:
 * var Events = {"Events": [{...}, {...}]}
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";

interface RioPerformance {
  StartDate: string;      // "2025-12-19"
  StartTime: string;      // "1800" (HHMM format)
  AuditoriumName: string; // "Screen 1"
  URL: string;           // Booking URL path
}

interface RioEvent {
  ID: number;
  Title: string;
  Director: string;
  Year: string;
  RunningTime: number;
  URL: string;
  Performances: RioPerformance[];
}

interface RioEventsData {
  Events: RioEvent[];
}

export class RioScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "rio-dalston",
    baseUrl: "https://riocinema.org.uk",
    requestsPerMinute: 10,
    delayBetweenRequests: 1000,
  };

  protected async fetchPages(): Promise<string[]> {
    // Rio has all data on the homepage as embedded JSON
    const url = this.config.baseUrl;
    console.log(`[${this.config.cinemaId}] Fetching homepage: ${url}`);

    const html = await this.fetchUrl(url);
    return [html];
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const screenings: RawScreening[] = [];
    const html = htmlPages[0];

    // Extract the Events JSON from the page
    // Format: var Events = {"Events": [...]}; (ends with semicolon)
    // The JSON is large and contains HTML, so we need to find the exact boundaries
    const startMarker = 'var Events = ';
    const startIdx = html.indexOf(startMarker);

    if (startIdx === -1) {
      console.log(`[${this.config.cinemaId}] No Events variable found on page`);
      return [];
    }

    // Find the end by matching brackets
    const jsonStart = startIdx + startMarker.length;
    let jsonEnd = jsonStart;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = jsonStart; i < html.length; i++) {
      const char = html[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
    }

    const jsonStr = html.slice(jsonStart, jsonEnd);

    if (!jsonStr || braceCount !== 0) {
      console.log(`[${this.config.cinemaId}] Failed to extract Events JSON`);
      return [];
    }

    try {
      const eventsData: RioEventsData = JSON.parse(jsonStr);
      console.log(`[${this.config.cinemaId}] Found ${eventsData.Events.length} films`);

      const now = new Date();

      for (const event of eventsData.Events) {
        for (const perf of event.Performances) {
          const datetime = this.parseDateTime(perf.StartDate, perf.StartTime);

          // Skip past screenings
          if (datetime < now) continue;

          // Build booking URL
          const bookingUrl = perf.URL.startsWith("http")
            ? perf.URL
            : `${this.config.baseUrl}/${perf.URL}`;

          screenings.push({
            filmTitle: event.Title,
            datetime,
            screen: perf.AuditoriumName || undefined,
            bookingUrl,
            sourceId: `rio-dalston-${event.ID}-${datetime.toISOString()}`,
          });
        }
      }

      console.log(`[${this.config.cinemaId}] Found ${screenings.length} future screenings`);
    } catch (error) {
      console.error(`[${this.config.cinemaId}] Error parsing Events JSON:`, error);
    }

    return screenings;
  }

  private parseDateTime(dateStr: string, timeStr: string): Date {
    // dateStr: "2025-12-19"
    // timeStr: "1800" (HHMM format)
    const hours = parseInt(timeStr.substring(0, 2), 10);
    const minutes = parseInt(timeStr.substring(2, 4), 10);

    const date = new Date(dateStr);
    date.setHours(hours, minutes, 0, 0);

    return date;
  }
}

export function createRioScraper(): RioScraper {
  return new RioScraper();
}
