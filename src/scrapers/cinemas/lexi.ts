/**
 * Lexi Cinema Scraper (Kensal Rise)
 *
 * Social enterprise cinema - profits go to charity
 * Website: https://thelexicinema.co.uk
 *
 * Uses Savoy Systems platform which embeds a complete JSON data structure
 * in the homepage: var Events = {"Events": [...]}
 *
 * This JSON contains all films and all their performances, so we can
 * extract everything from a single page fetch - no Playwright needed!
 */

import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";

export const LEXI_CONFIG: ScraperConfig = {
  cinemaId: "lexi",
  baseUrl: "https://thelexicinema.co.uk",
  requestsPerMinute: 10,
  delayBetweenRequests: 500,
};

export const LEXI_VENUE = {
  id: "lexi",
  name: "The Lexi Cinema",
  shortName: "Lexi",
  area: "Kensal Rise",
  postcode: "NW10 5SN",
  address: "194b Chamberlayne Road",
  features: ["independent", "charity", "single_screen", "repertory"],
  website: "https://thelexicinema.co.uk",
};

// Types for the embedded JSON structure
interface LexiPerformance {
  ID: number;
  StartDate: string;        // "2025-12-30"
  StartTime: string;        // "1415" (4-digit HHMM)
  StartTimeAndNotes: string; // "14:15" with optional notes
  ReadableDate: string;     // "Tue 30 Dec"
  URL: string;              // Booking URL
  IsSoldOut: string;        // "Y" or "N"
  IsOpenForSale: boolean;
  AuditoriumName: string;   // "Screen 1", "Screen 2"
  Notes: string;            // "HOH Subtitled", etc.
}

interface LexiEvent {
  ID: number;
  Title: string;
  URL: string;
  Type: number;
  TypeDescription: string;  // "Film", etc.
  RunningTime: number;
  Performances: LexiPerformance[];
}

interface LexiEventsData {
  Events: LexiEvent[];
}

export class LexiScraper implements CinemaScraper {
  config = LEXI_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log("[lexi] Starting scrape...");

    try {
      const html = await this.fetchHomepage();
      const eventsData = this.extractEventsJson(html);

      if (!eventsData) {
        throw new Error("Could not find Events JSON in page");
      }

      console.log("[lexi] Found " + eventsData.Events.length + " events in JSON");

      // Filter for films only (TypeDescription === "Film")
      const films = eventsData.Events.filter(e => e.TypeDescription === "Film");
      console.log("[lexi] Found " + films.length + " films");

      const screenings = this.extractScreenings(films);
      const validated = this.validate(screenings);

      console.log("[lexi] Found " + validated.length + " valid screenings total");
      return validated;
    } catch (error) {
      console.error("[lexi] Scrape failed:", error);
      throw error;
    }
  }

  private async fetchHomepage(): Promise<string> {
    const url = this.config.baseUrl + "/TheLexiCinema.dll/Home";
    console.log("[lexi] Fetching homepage: " + url);

    const response = await fetch(url, {
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status + ": " + response.statusText);
    }

    return response.text();
  }

  /**
   * Extract the Events JSON from the page HTML
   * Pattern: var Events = {"Events":[...]}
   *
   * Uses bracket matching instead of regex to handle nested structures correctly.
   */
  private extractEventsJson(html: string): LexiEventsData | null {
    // Find the start of var Events =
    const startMatch = html.match(/var Events\s*=\s*/);
    if (!startMatch || startMatch.index === undefined) {
      console.error("[lexi] Could not find 'var Events' in page");
      return null;
    }

    const startIndex = startMatch.index + startMatch[0].length;

    // Verify we're starting at a brace
    if (html[startIndex] !== "{") {
      console.error("[lexi] Expected '{' after 'var Events =', got:", html[startIndex]);
      return null;
    }

    // Use bracket matching to find the complete JSON object
    let depth = 0;
    let inString = false;
    let escape = false;
    let endIndex = startIndex;

    for (let i = startIndex; i < html.length; i++) {
      const char = html[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === "\\") {
        escape = true;
        continue;
      }

      if (char === '"' && !escape) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") depth++;
        if (char === "}") {
          depth--;
          if (depth === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }
    }

    if (depth !== 0) {
      console.error("[lexi] Could not find matching closing brace for Events JSON");
      return null;
    }

    const jsonStr = html.substring(startIndex, endIndex);

    try {
      const data = JSON.parse(jsonStr) as LexiEventsData;
      return data;
    } catch (error) {
      console.error("[lexi] Failed to parse Events JSON:", error);
      return null;
    }
  }

  private extractScreenings(films: LexiEvent[]): RawScreening[] {
    const screenings: RawScreening[] = [];
    const now = new Date();

    for (const film of films) {
      if (!film.Performances || film.Performances.length === 0) continue;

      const cleanedTitle = this.cleanTitle(film.Title);

      for (const perf of film.Performances) {
        // Skip sold out or closed for sale
        if (perf.IsSoldOut === "Y") continue;
        if (!perf.IsOpenForSale) continue;

        // Parse datetime from StartDate + StartTime
        const datetime = this.parseDateTime(perf.StartDate, perf.StartTime);
        if (!datetime) continue;

        // Skip past screenings
        if (datetime < now) continue;

        // Build booking URL
        const bookingUrl = perf.URL.startsWith("http")
          ? perf.URL
          : this.config.baseUrl + "/TheLexiCinema.dll/" + perf.URL;

        screenings.push({
          filmTitle: cleanedTitle,
          datetime,
          bookingUrl,
          sourceId: "lexi-" + film.ID + "-" + perf.ID,
        });
      }
    }

    return screenings;
  }

  /**
   * Parse datetime from StartDate "2025-12-30" and StartTime "1415"
   */
  private parseDateTime(dateStr: string, timeStr: string): Date | null {
    if (!dateStr || !timeStr) return null;

    // Parse date: "2025-12-30"
    const dateParts = dateStr.split("-");
    if (dateParts.length !== 3) return null;

    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1; // JS months are 0-indexed
    const day = parseInt(dateParts[2], 10);

    // Parse time: "1415" -> 14:15
    let hours: number;
    let minutes: number;

    if (timeStr.length === 4) {
      hours = parseInt(timeStr.substring(0, 2), 10);
      minutes = parseInt(timeStr.substring(2, 4), 10);
    } else if (timeStr.length === 3) {
      // Handle times like "930" -> 9:30
      hours = parseInt(timeStr.substring(0, 1), 10);
      minutes = parseInt(timeStr.substring(1, 3), 10);
    } else {
      return null;
    }

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
      return null;
    }

    return new Date(year, month, day, hours, minutes, 0);
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/\s*\(\d{4}\)\s*$/, "")  // Remove year like (2024)
      .replace(/\s*\((?:U|PG|12A?|15|18|TBC)\)\s*/gi, "")  // Remove ratings
      .replace(/\s*\+\s*(Q\s*&?\s*A|intro|discussion).*$/i, "")
      .trim();
  }

  private validate(screenings: RawScreening[]): RawScreening[] {
    const now = new Date();
    const seen = new Set<string>();

    return screenings.filter((s) => {
      if (!s.filmTitle || s.filmTitle.trim() === "") return false;
      if (!s.datetime || isNaN(s.datetime.getTime())) return false;
      if (s.datetime < now) return false;

      // Deduplicate by sourceId
      if (s.sourceId && seen.has(s.sourceId)) return false;
      if (s.sourceId) seen.add(s.sourceId);

      return true;
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.config.baseUrl, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function createLexiScraper(): LexiScraper {
  return new LexiScraper();
}
