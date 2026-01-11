/**
 * Base Season Scraper
 * Abstract class for scrapers that extract director seasons and retrospectives
 *
 * Follows the same template method pattern as BaseScraper but specialized
 * for season data extraction rather than individual screenings.
 */

import * as cheerio from "cheerio";
import type { CheerioAPI } from "../utils/cheerio-types";
import type {
  RawSeason,
  RawSeasonFilm,
  SeasonScraperConfig,
  SeasonScraper,
} from "./types";

export abstract class BaseSeasonScraper implements SeasonScraper {
  abstract config: SeasonScraperConfig;

  /**
   * Main scrape method - template method pattern
   * Subclasses implement fetchSeasonPages() and parseSeasons()
   */
  async scrape(): Promise<RawSeason[]> {
    console.log(`[${this.config.cinemaId}] Starting season scrape...`);

    try {
      await this.initialize();
      const pages = await this.fetchSeasonPages();
      const seasons = await this.parseSeasons(pages);
      const validated = this.validate(seasons);
      await this.cleanup();

      console.log(
        `[${this.config.cinemaId}] Found ${validated.length} valid seasons`
      );
      return validated;
    } catch (error) {
      console.error(`[${this.config.cinemaId}] Season scrape failed:`, error);
      throw error;
    }
  }

  /**
   * Fetch HTML pages containing season information
   * May be a single listing page or multiple detail pages
   */
  protected abstract fetchSeasonPages(): Promise<string[]>;

  /**
   * Parse HTML pages into raw season data
   */
  protected abstract parseSeasons(htmlPages: string[]): Promise<RawSeason[]>;

  /**
   * Initialize before scraping (optional override)
   * Use for Playwright browser setup, auth, etc.
   */
  protected async initialize(): Promise<void> {}

  /**
   * Cleanup after scraping (optional override)
   * Use for closing browser, clearing state, etc.
   */
  protected async cleanup(): Promise<void> {}

  /**
   * Validate and filter seasons
   * Ensures each season has minimum required data
   */
  protected validate(seasons: RawSeason[]): RawSeason[] {
    return seasons.filter((season) => {
      // Must have a name
      if (!season.name || season.name.trim() === "") {
        console.warn(
          `[${this.config.cinemaId}] Skipping season with empty name`
        );
        return false;
      }

      // Must have website URL
      if (!season.websiteUrl || season.websiteUrl.trim() === "") {
        console.warn(
          `[${this.config.cinemaId}] Skipping season "${season.name}" - no website URL`
        );
        return false;
      }

      // Must have at least one film
      if (!season.films || season.films.length === 0) {
        console.warn(
          `[${this.config.cinemaId}] Skipping season "${season.name}" - no films`
        );
        return false;
      }

      // Validate films have titles
      const validFilms = season.films.filter(
        (f) => f.title && f.title.trim() !== ""
      );
      if (validFilms.length === 0) {
        console.warn(
          `[${this.config.cinemaId}] Skipping season "${season.name}" - no valid films`
        );
        return false;
      }

      // Update films list to only include valid ones
      season.films = validFilms;

      return true;
    });
  }

  /**
   * Fetch a single URL with rate limiting
   */
  protected async fetchUrl(url: string): Promise<string> {
    await this.delay(this.config.delayBetweenRequests);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Create a Cheerio instance from HTML
   */
  protected parseHtml(html: string): CheerioAPI {
    return cheerio.load(html);
  }

  /**
   * Delay helper for rate limiting
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate a slug from a season name
   * e.g., "Kurosawa: Master of Cinema" -> "kurosawa-master-of-cinema"
   */
  protected generateSlug(name: string, suffix?: string): string {
    let slug = name
      .toLowerCase()
      .replace(/['']/g, "") // Remove apostrophes
      .replace(/[:;,!?()[\]{}]/g, "") // Remove punctuation
      .replace(/\s+/g, "-") // Spaces to hyphens
      .replace(/-+/g, "-") // Collapse multiple hyphens
      .replace(/^-|-$/g, ""); // Trim leading/trailing hyphens

    if (suffix) {
      slug = `${slug}-${suffix}`;
    }

    return slug;
  }

  /**
   * Extract director name from season title
   * Common patterns:
   * - "Kurosawa: Master of Cinema" -> "Kurosawa"
   * - "The Films of Stanley Kubrick" -> "Stanley Kubrick"
   * - "David Lynch: The Dreamer" -> "David Lynch"
   */
  protected extractDirectorFromTitle(title: string): string | undefined {
    // Pattern 1: "Name: Subtitle" (e.g., "Kurosawa: Master of Cinema")
    const colonMatch = title.match(/^([^:]+):/);
    if (colonMatch) {
      const name = colonMatch[1].trim();
      // Only return if it looks like a name (not too long, no common words)
      if (name.split(/\s+/).length <= 3 && !this.isCommonWord(name)) {
        return name;
      }
    }

    // Pattern 2: "The Films of Name" or "Films by Name"
    const filmsOfMatch = title.match(/(?:the\s+)?films\s+(?:of|by)\s+(.+)/i);
    if (filmsOfMatch) {
      return filmsOfMatch[1].trim();
    }

    // Pattern 3: "Name Season" or "Name Retrospective"
    const retroMatch = title.match(/^(.+?)\s+(?:season|retrospective|at\s+\d)/i);
    if (retroMatch) {
      const name = retroMatch[1].trim();
      if (name.split(/\s+/).length <= 3 && !this.isCommonWord(name)) {
        return name;
      }
    }

    return undefined;
  }

  /**
   * Check if a string is a common word (not a director name)
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      "the",
      "classic",
      "classics",
      "big",
      "screen",
      "new",
      "cinema",
      "film",
      "films",
      "movie",
      "movies",
      "season",
      "special",
      "series",
      "collection",
      "retrospective",
      "festival",
    ]);
    return commonWords.has(word.toLowerCase());
  }

  /**
   * Parse a date range string into start and end dates
   * Common formats:
   * - "1 Jan - 31 Mar 2025"
   * - "January 2025"
   * - "1-31 December 2025"
   */
  protected parseDateRange(
    text: string
  ): { startDate: Date; endDate: Date } | null {
    const now = new Date();
    const currentYear = now.getFullYear();

    // Pattern: "DD Mon - DD Mon YYYY" or "DD Mon YYYY - DD Mon YYYY"
    const rangeMatch = text.match(
      /(\d{1,2})\s*(\w+)\s*[-–—]\s*(\d{1,2})\s*(\w+)\s*(\d{4})?/i
    );
    if (rangeMatch) {
      const [, startDay, startMonth, endDay, endMonth, yearStr] = rangeMatch;
      const year = yearStr ? parseInt(yearStr) : currentYear;

      const startDate = this.parseMonthDay(startDay, startMonth, year);
      const endDate = this.parseMonthDay(endDay, endMonth, year);

      if (startDate && endDate) {
        return { startDate, endDate };
      }
    }

    // Pattern: "Month YYYY" (assume full month)
    const monthYearMatch = text.match(/(\w+)\s+(\d{4})/i);
    if (monthYearMatch) {
      const [, month, yearStr] = monthYearMatch;
      const year = parseInt(yearStr);
      const monthIndex = this.getMonthIndex(month);

      if (monthIndex !== -1) {
        const startDate = new Date(year, monthIndex, 1);
        const endDate = new Date(year, monthIndex + 1, 0); // Last day of month
        return { startDate, endDate };
      }
    }

    return null;
  }

  /**
   * Parse a day and month into a Date
   */
  private parseMonthDay(
    day: string,
    month: string,
    year: number
  ): Date | null {
    const monthIndex = this.getMonthIndex(month);
    if (monthIndex === -1) return null;

    return new Date(year, monthIndex, parseInt(day));
  }

  /**
   * Get month index from name
   */
  private getMonthIndex(month: string): number {
    const months: Record<string, number> = {
      jan: 0, january: 0,
      feb: 1, february: 1,
      mar: 2, march: 2,
      apr: 3, april: 3,
      may: 4,
      jun: 5, june: 5,
      jul: 6, july: 6,
      aug: 7, august: 7,
      sep: 8, sept: 8, september: 8,
      oct: 9, october: 9,
      nov: 10, november: 10,
      dec: 11, december: 11,
    };
    return months[month.toLowerCase()] ?? -1;
  }

  /**
   * Health check - verify the seasons page is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.config.baseUrl}${this.config.seasonsPath}`;
      const response = await fetch(url, {
        method: "HEAD",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PicturesBot/1.0)",
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
