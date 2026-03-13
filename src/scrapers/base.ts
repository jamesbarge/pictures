/**
 * Base Scraper Class
 * Abstract class that all cinema scrapers extend
 */

import * as cheerio from "cheerio";
import { readFile } from "fs/promises";
import { join } from "path";
import type { RawScreening, ScraperConfig, CinemaScraper } from "./types";
import { CHROME_USER_AGENT_FULL } from "./constants";

/**
 * Runtime config overlay for AutoScrape experiments.
 * Stored as JSON files in .autoresearch/overlays/{cinemaId}.json
 */
export interface ConfigOverlay {
  /** CSS selector overrides keyed by purpose */
  selectorOverrides?: Record<string, string>;
  /** URL pattern overrides */
  urlOverrides?: Record<string, string>;
  /** Date format overrides */
  dateFormatOverrides?: Record<string, string>;
}

const OVERLAY_DIR = join(process.cwd(), ".autoresearch", "overlays");

export abstract class BaseScraper implements CinemaScraper {
  abstract config: ScraperConfig;

  /** Runtime config overlay loaded from disk (null if none exists) */
  protected configOverlay: ConfigOverlay | null = null;

  /**
   * Main scrape method - template method pattern
   */
  async scrape(): Promise<RawScreening[]> {
    console.log(`[${this.config.cinemaId}] Starting scrape...`);

    try {
      await this.loadConfigOverlay();
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
    const seen = new Set<string>();

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

      // Deduplicate by sourceId
      if (s.sourceId && seen.has(s.sourceId)) {
        return false;
      }
      if (s.sourceId) seen.add(s.sourceId);

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
        "User-Agent": CHROME_USER_AGENT_FULL,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      signal: AbortSignal.timeout(30_000),
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
   * Load a config overlay from disk if one exists for this cinema.
   * Called automatically at the start of scrape().
   * Overlays are JSON files created by AutoScrape experiments.
   */
  protected async loadConfigOverlay(): Promise<void> {
    const overlayPath = join(OVERLAY_DIR, `${this.config.cinemaId}.json`);
    try {
      const raw = await readFile(overlayPath, "utf-8");
      this.configOverlay = JSON.parse(raw) as ConfigOverlay;
      console.log(`[${this.config.cinemaId}] Loaded config overlay`);
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
        this.configOverlay = null; // Expected: no overlay for this cinema
        return;
      }
      // Surface real errors (bad JSON, permissions, disk issues)
      console.error(`[${this.config.cinemaId}] Failed to load config overlay:`, err);
      this.configOverlay = null;
    }
  }

  /**
   * Get a selector, preferring the overlay value if one exists.
   * Subclasses call this instead of hardcoding selectors to enable AutoScrape.
   */
  protected getSelector(purpose: string, defaultSelector: string): string {
    return this.configOverlay?.selectorOverrides?.[purpose] ?? defaultSelector;
  }

  /**
   * Get a URL, preferring the overlay value if one exists.
   */
  protected getUrl(purpose: string, defaultUrl: string): string {
    return this.configOverlay?.urlOverrides?.[purpose] ?? defaultUrl;
  }

  /**
   * Health check - verify the website is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.config.baseUrl, {
        method: "GET",
        headers: {
          "User-Agent": CHROME_USER_AGENT_FULL,
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
