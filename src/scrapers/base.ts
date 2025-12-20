/**
 * Base Scraper Class
 * Abstract class that all cinema scrapers extend
 */

import * as cheerio from "cheerio";
import type { RawScreening, ScraperConfig, CinemaScraper } from "./types";

export abstract class BaseScraper implements CinemaScraper {
  abstract config: ScraperConfig;

  /**
   * Main scrape method - template method pattern
   */
  async scrape(): Promise<RawScreening[]> {
    console.log(`[${this.config.cinemaId}] Starting scrape...`);

    try {
      await this.initialize();
      const pages = await this.fetchPages();
      const screenings = await this.parsePages(pages);
      const validated = this.validate(screenings);
      await this.cleanup();

      console.log(`[${this.config.cinemaId}] Found ${validated.length} valid screenings`);
      return validated;
    } catch (error) {
      console.error(`[${this.config.cinemaId}] Scrape failed:`, error);
      throw error;
    }
  }

  /**
   * Fetch HTML pages from the cinema website
   */
  protected abstract fetchPages(): Promise<string[]>;

  /**
   * Parse HTML pages into raw screenings
   */
  protected abstract parsePages(htmlPages: string[]): Promise<RawScreening[]>;

  /**
   * Initialize before scraping (optional override)
   */
  protected async initialize(): Promise<void> {}

  /**
   * Cleanup after scraping (optional override)
   */
  protected async cleanup(): Promise<void> {}

  /**
   * Validate and filter screenings
   */
  protected validate(screenings: RawScreening[]): RawScreening[] {
    const now = new Date();

    return screenings.filter((s) => {
      // Must have title
      if (!s.filmTitle || s.filmTitle.trim() === "") {
        return false;
      }

      // Must have valid datetime in the future
      if (!s.datetime || isNaN(s.datetime.getTime())) {
        return false;
      }
      if (s.datetime < now) {
        return false;
      }

      // Must have booking URL
      if (!s.bookingUrl || s.bookingUrl.trim() === "") {
        return false;
      }

      return true;
    });
  }

  /**
   * Fetch a single URL with rate limiting
   */
  protected async fetchUrl(url: string): Promise<string> {
    // Rate limiting delay
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
  protected parseHtml(html: string) {
    return cheerio.load(html);
  }

  /**
   * Delay helper for rate limiting
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Health check - verify the website is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.config.baseUrl, {
        method: "HEAD",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PostboxdBot/1.0)",
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
