// @ts-nocheck
/**
 * Lexi Cinema Scraper (Kensal Rise)
 *
 * Social enterprise cinema - profits go to charity
 * Website: https://thelexicinema.co.uk
 */

import * as cheerio from "cheerio";
import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";

// ============================================================================
// Lexi Cinema Configuration
// ============================================================================

export const LEXI_CONFIG: ScraperConfig = {
  cinemaId: "lexi",
  baseUrl: "https://thelexicinema.co.uk",
  requestsPerMinute: 10,
  delayBetweenRequests: 2000,
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

// ============================================================================
// Lexi Scraper Implementation
// ============================================================================

export class LexiScraper implements CinemaScraper {
  config = LEXI_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log(`[lexi] Starting scrape...`);

    try {
      const html = await this.fetchPage("/whats-on/");
      const screenings = this.parseScreenings(html);

      const validated = this.validate(screenings);
      console.log(`[lexi] Found ${validated.length} valid screenings`);

      return validated;
    } catch (error) {
      console.error(`[lexi] Scrape failed:`, error);
      throw error;
    }
  }

  private async fetchPage(path: string): Promise<string> {
    const url = `${this.config.baseUrl}${path}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    return response.text();
  }

  private parseScreenings(html: string): RawScreening[] {
    const $ = cheerio.load(html);
    const screenings: RawScreening[] = [];

    // Lexi typically lists films with dates and times
    $(".film, .event, .screening, article, .programme-item").each((_, el) => {
      const $film = $(el);

      // Extract title
      const title = $film.find("h2, h3, .title, .film-title").first().text().trim();
      if (!title || title.length < 2) return;

      // Get the full text for date/time parsing
      const fullText = $film.text();

      // Look for showtimes
      $film.find("a[href*='book'], .showtime, .time").each((_, timeEl) => {
        const $time = $(timeEl);
        const timeText = $time.text().trim();
        const bookingUrl = $time.attr("href") || $film.find("a").first().attr("href") || "";

        const datetime = this.parseDateTime(fullText, timeText);
        if (!datetime) return;

        screenings.push({
          filmTitle: this.cleanTitle(title),
          datetime,
          bookingUrl: bookingUrl.startsWith("http")
            ? bookingUrl
            : `${this.config.baseUrl}${bookingUrl}`,
          sourceId: `lexi-${title.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`,
        });
      });

      // If no specific showtimes found, try to extract from text
      if (screenings.length === 0) {
        const extracted = this.extractScreeningsFromText(fullText, title, $film);
        screenings.push(...extracted);
      }
    });

    return screenings;
  }

  private extractScreeningsFromText(
    text: string,
    title: string,
    $film: cheerio.Cheerio<cheerio.Element>
  ): RawScreening[] {
    const screenings: RawScreening[] = [];

    // Pattern: "Sat 21 Dec 7:30pm" or "December 21, 19:30"
    const patterns = [
      /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}):(\d{2})\s*(am|pm)?/gi,
      /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+(\w+)\s+(\d{1,2}):(\d{2})/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const datetime = this.parseMatch(match);
        if (datetime) {
          const bookingUrl = $film.find("a").first().attr("href") || this.config.baseUrl;

          screenings.push({
            filmTitle: this.cleanTitle(title),
            datetime,
            bookingUrl: bookingUrl.startsWith("http")
              ? bookingUrl
              : `${this.config.baseUrl}${bookingUrl}`,
            sourceId: `lexi-${title.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`,
          });
        }
      }
    }

    return screenings;
  }

  private parseMatch(match: RegExpExecArray): Date | null {
    const months: Record<string, number> = {
      jan: 0, january: 0,
      feb: 1, february: 1,
      mar: 2, march: 2,
      apr: 3, april: 3,
      may: 4,
      jun: 5, june: 5,
      jul: 6, july: 6,
      aug: 7, august: 7,
      sep: 8, september: 8,
      oct: 9, october: 9,
      nov: 10, november: 10,
      dec: 11, december: 11,
    };

    try {
      // Pattern 1: "21 Dec 7:30pm"
      if (match.length >= 5 && !isNaN(parseInt(match[1]))) {
        const day = parseInt(match[1]);
        const month = months[match[2].toLowerCase()];
        let hours = parseInt(match[3]);
        const minutes = parseInt(match[4]);
        const ampm = match[5]?.toLowerCase();

        if (ampm === "pm" && hours < 12) hours += 12;
        if (ampm === "am" && hours === 12) hours = 0;

        const year = new Date().getFullYear();
        const datetime = new Date(year, month, day, hours, minutes);

        if (datetime < new Date()) {
          datetime.setFullYear(year + 1);
        }

        return datetime;
      }

      // Pattern 2: "Saturday 21 December 19:30"
      if (match.length >= 6) {
        const day = parseInt(match[2]);
        const month = months[match[3].toLowerCase()];
        const hours = parseInt(match[4]);
        const minutes = parseInt(match[5]);

        const year = new Date().getFullYear();
        const datetime = new Date(year, month, day, hours, minutes);

        if (datetime < new Date()) {
          datetime.setFullYear(year + 1);
        }

        return datetime;
      }
    } catch {
      return null;
    }

    return null;
  }

  private parseDateTime(contextText: string, timeText: string): Date | null {
    // Try to find time in timeText first
    const timeMatch = timeText.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!timeMatch) return null;

    // Find date in context
    const dateMatch = contextText.match(
      /(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)/i
    );

    const months: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3,
      may: 4, june: 5, july: 6, august: 7,
      september: 8, october: 9, november: 10, december: 11,
    };

    const year = new Date().getFullYear();
    let day: number;
    let month: number;

    if (dateMatch) {
      day = parseInt(dateMatch[1]);
      month = months[dateMatch[2].toLowerCase()];
    } else {
      // Default to today
      const now = new Date();
      day = now.getDate();
      month = now.getMonth();
    }

    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const ampm = timeMatch[3]?.toLowerCase();

    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;

    const datetime = new Date(year, month, day, hours, minutes);

    if (datetime < new Date()) {
      datetime.setFullYear(year + 1);
    }

    return datetime;
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/\s*\(\d{4}\)\s*$/, "")
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
