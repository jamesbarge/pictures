/**
 * BFI Season Scraper
 * Scrapes director seasons and retrospectives from BFI Southbank
 *
 * Uses Playwright with stealth plugin to bypass Cloudflare protection.
 * Visits the seasons listing page, then each season detail page for films.
 *
 * URL pattern:
 * - Listing: whatson.bfi.org.uk/Online/default.asp?BOparam::WScontent::loadArticle::permalink=seasons
 * - Detail: whatson.bfi.org.uk/Online/default.asp?BOparam::WScontent::loadArticle::permalink=[season-name]
 */

import type { Page } from "playwright";
import { BaseSeasonScraper } from "./base";
import type { RawSeason, RawSeasonFilm, SeasonScraperConfig } from "./types";
import {
  getBrowser,
  closeBrowser,
  createPage,
  waitForCloudflare,
} from "../utils/browser";

/**
 * Configuration for BFI season scraping
 */
const BFI_SEASON_CONFIG: SeasonScraperConfig = {
  cinemaId: "bfi-southbank",
  baseUrl: "https://whatson.bfi.org.uk/Online",
  seasonsPath:
    "/default.asp?BOparam::WScontent::loadArticle::permalink=seasons",
  requestsPerMinute: 6, // Conservative for Cloudflare
  delayBetweenRequests: 5000,
};

/**
 * Headings/section titles to filter out (not actual films)
 * These are common page structure elements on BFI's site
 */
const SECTION_HEADINGS = new Set([
  // Generic sections
  "programme",
  "season programme",
  "screenings",
  "events",
  "talks & events",
  "courses",
  "course",
  "want more?",
  "also showing",
  "releases",
  "new release",
  "new releases",
  "installation",
  "relaxed",
  "relaxed screening",
  "relaxed screenings",
  // BFI-specific sections
  "bfi imax screenings",
  "bfi southbank programme",
  "bfi southbank screenings",
  // Month names (sometimes used as section headers)
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
]);

/**
 * BFI Season Scraper
 */
export class BFISeasonScraper extends BaseSeasonScraper {
  config = BFI_SEASON_CONFIG;
  private page: Page | null = null;

  /**
   * Initialize Playwright browser with stealth mode
   */
  protected async initialize(): Promise<void> {
    console.log(`[${this.config.cinemaId}] Launching browser with stealth mode...`);
    await getBrowser();
    this.page = await createPage();

    // Warm up session on homepage first
    console.log(`[${this.config.cinemaId}] Warming up session...`);
    await this.page.goto(`${this.config.baseUrl}/default.asp`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Wait for Cloudflare challenge
    const passed = await waitForCloudflare(this.page, 60);
    if (!passed) {
      console.warn(
        `[${this.config.cinemaId}] Cloudflare timeout, continuing anyway...`
      );
    }

    await this.page.waitForTimeout(2000);
    console.log(`[${this.config.cinemaId}] Session established`);
  }

  /**
   * Clean up browser resources
   */
  protected async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    await closeBrowser();
    console.log(`[${this.config.cinemaId}] Browser closed`);
  }

  /**
   * Fetch the seasons listing page HTML
   */
  protected async fetchSeasonPages(): Promise<string[]> {
    if (!this.page) throw new Error("Browser not initialized");

    const url = `${this.config.baseUrl}${this.config.seasonsPath}`;
    console.log(`[${this.config.cinemaId}] Fetching seasons listing: ${url}`);

    await this.page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Wait for Cloudflare again (page transition)
    await waitForCloudflare(this.page, 30);
    await this.page.waitForTimeout(3000);

    const html = await this.page.content();
    return [html];
  }

  /**
   * Parse seasons from the listing page
   */
  protected async parseSeasons(htmlPages: string[]): Promise<RawSeason[]> {
    const listingHtml = htmlPages[0];
    const $ = this.parseHtml(listingHtml);
    const seasons: RawSeason[] = [];

    // Find season cards on the listing page
    // BFI uses article-style cards with image + title + link
    const seasonCards = this.parseSeasonCards($);
    console.log(`[${this.config.cinemaId}] Found ${seasonCards.length} season cards`);

    // Visit each season detail page to extract films
    for (const card of seasonCards) {
      try {
        const season = await this.fetchSeasonDetail(card);
        if (season && season.films.length > 0) {
          seasons.push(season);
        }
      } catch (error) {
        console.error(
          `[${this.config.cinemaId}] Failed to fetch season "${card.name}":`,
          error
        );
      }

      // Rate limiting
      await this.delay(this.config.delayBetweenRequests);
    }

    return seasons;
  }

  /**
   * Parse season cards from the listing page
   */
  private parseSeasonCards($: ReturnType<typeof this.parseHtml>): SeasonCard[] {
    const cards: SeasonCard[] = [];

    // BFI's article cards contain season info
    // Look for linked images or headers within article elements
    $("article, .article-card, .event-card, .season-card").each((_, el) => {
      const $el = $(el);

      // Find the season link
      const $link = $el.find('a[href*="permalink="]').first();
      if (!$link.length) return;

      const href = $link.attr("href");
      if (!href) return;

      // Extract permalink from URL
      const permalinkMatch = href.match(/permalink=([^&]+)/);
      if (!permalinkMatch) return;

      const permalink = permalinkMatch[1];

      // Skip the main "seasons" page link
      if (permalink === "seasons") return;

      // Get title from link text, heading, or image alt
      let name =
        $el.find("h2, h3, .title").first().text().trim() ||
        $link.text().trim() ||
        $el.find("img").attr("alt") ||
        "";

      if (!name) return;

      // Skip if this looks like a section heading
      if (this.isSectionHeading(name)) return;

      // Get poster image if available
      const posterUrl = $el.find("img").attr("src") || undefined;

      // Build full URL
      const detailUrl = href.startsWith("http")
        ? href
        : `${this.config.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

      cards.push({
        name,
        permalink,
        detailUrl,
        posterUrl,
      });
    });

    // Alternative: Look for season links in general content areas
    if (cards.length === 0) {
      $('a[href*="permalink="]').each((_, el) => {
        const $link = $(el);
        const href = $link.attr("href");
        if (!href) return;

        const permalinkMatch = href.match(/permalink=([^&]+)/);
        if (!permalinkMatch) return;

        const permalink = permalinkMatch[1];
        if (permalink === "seasons") return;

        // Only consider links with meaningful text
        const name = $link.text().trim();
        if (!name || name.length < 3) return;
        if (this.isSectionHeading(name)) return;

        // Get any nearby image
        const $img = $link.find("img").first();
        const posterUrl = $img.attr("src") || undefined;

        const detailUrl = href.startsWith("http")
          ? href
          : `${this.config.baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

        // Avoid duplicates
        if (!cards.some((c) => c.permalink === permalink)) {
          cards.push({
            name,
            permalink,
            detailUrl,
            posterUrl,
          });
        }
      });
    }

    return cards;
  }

  /**
   * Fetch a season detail page and extract films
   */
  private async fetchSeasonDetail(card: SeasonCard): Promise<RawSeason | null> {
    if (!this.page) throw new Error("Browser not initialized");

    console.log(`[${this.config.cinemaId}] Fetching season detail: ${card.name}`);

    await this.page.goto(card.detailUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await waitForCloudflare(this.page, 20);
    await this.page.waitForTimeout(2000);

    const html = await this.page.content();
    const $ = this.parseHtml(html);

    // Extract season details
    const description = this.extractDescription($);
    const dateRange = this.extractDateRange($);
    const films = this.extractFilms($);

    console.log(
      `[${this.config.cinemaId}]   → ${films.length} films found in "${card.name}"`
    );

    // Extract director name from season title
    const directorName = this.extractDirectorFromTitle(card.name);

    return {
      name: card.name,
      directorName,
      description,
      startDate: dateRange?.startDate,
      endDate: dateRange?.endDate,
      posterUrl: card.posterUrl ? this.resolveUrl(card.posterUrl) : undefined,
      websiteUrl: card.detailUrl,
      sourceCinema: this.config.cinemaId,
      films,
      sourceId: card.permalink,
    };
  }

  /**
   * Extract description from season detail page
   */
  private extractDescription($: ReturnType<typeof this.parseHtml>): string | undefined {
    // Look for common description containers
    const selectors = [
      ".article-content p",
      ".content p",
      ".description",
      ".intro",
      "article p",
      ".synopsis",
    ];

    for (const selector of selectors) {
      const text = $(selector).first().text().trim();
      if (text && text.length > 20) {
        return text.substring(0, 500); // Limit length
      }
    }

    return undefined;
  }

  /**
   * Extract date range from page content
   */
  private extractDateRange(
    $: ReturnType<typeof this.parseHtml>
  ): { startDate: Date; endDate: Date } | null {
    // Look for date text in common locations
    const dateSelectors = [".date-range", ".dates", ".event-date", "time"];

    for (const selector of dateSelectors) {
      const dateText = $(selector).first().text().trim();
      if (dateText) {
        const range = this.parseDateRange(dateText);
        if (range) return range;
      }
    }

    // Also check page text for date patterns
    const pageText = $("body").text();
    const datePattern =
      /(\d{1,2})\s*(\w+)\s*[-–—]\s*(\d{1,2})\s*(\w+)\s*(\d{4})?/i;
    const match = pageText.match(datePattern);
    if (match) {
      return this.parseDateRange(match[0]);
    }

    return null;
  }

  /**
   * Extract films from the season detail page
   *
   * BFI pages structure films as headings with "Read more" links.
   * We look for heading patterns followed by film page links.
   */
  private extractFilms($: ReturnType<typeof this.parseHtml>): RawSeasonFilm[] {
    const films: RawSeasonFilm[] = [];
    const seenTitles = new Set<string>();

    // Strategy 1: Find headings (h2, h3) that are followed by "Read more" links
    // These are typically individual film entries
    $("h2, h3").each((index, el) => {
      const $heading = $(el);
      const title = $heading.text().trim();

      if (!title || title.length < 2) return;
      if (this.isSectionHeading(title)) return;

      // Check if there's a "Read more" or film detail link nearby
      const $next = $heading.next();
      const $parent = $heading.parent();

      // Look for film links (not "Read more" for the season itself)
      const hasFilmLink =
        $parent.find('a[href*="permalink="]').length > 0 ||
        $next.find('a[href*="permalink="]').length > 0 ||
        $next.is('a[href*="permalink="]');

      // Also check for "Read more" text
      const hasReadMore =
        $parent.text().toLowerCase().includes("read more") ||
        $next.text().toLowerCase().includes("read more");

      if (hasFilmLink || hasReadMore) {
        const normalized = title.toLowerCase();
        if (!seenTitles.has(normalized)) {
          seenTitles.add(normalized);

          // Extract year from title if present (e.g., "Film Title (1992)")
          const yearMatch = title.match(/\((\d{4})\)/);
          const year = yearMatch ? parseInt(yearMatch[1]) : undefined;
          const cleanTitle = title.replace(/\s*\(\d{4}\)\s*$/, "").trim();

          // Get film URL if available
          const filmLink = $parent.find('a[href*="permalink="]').first();
          const filmUrl = filmLink.attr("href");

          films.push({
            title: cleanTitle,
            year,
            orderIndex: index,
            filmUrl: filmUrl
              ? this.resolveUrl(filmUrl)
              : undefined,
          });
        }
      }
    });

    // Strategy 2: Look for list-based film entries
    if (films.length === 0) {
      $("li a[href*='permalink='], .film-item a, .event-item a").each(
        (index, el) => {
          const $link = $(el);
          const href = $link.attr("href") || "";

          // Skip season links
          if (href.includes("permalink=seasons")) return;

          const title = $link.text().trim();
          if (!title || title.length < 2) return;
          if (this.isSectionHeading(title)) return;

          const normalized = title.toLowerCase();
          if (!seenTitles.has(normalized)) {
            seenTitles.add(normalized);

            const yearMatch = title.match(/\((\d{4})\)/);
            const year = yearMatch ? parseInt(yearMatch[1]) : undefined;
            const cleanTitle = title.replace(/\s*\(\d{4}\)\s*$/, "").trim();

            films.push({
              title: cleanTitle,
              year,
              orderIndex: index,
              filmUrl: this.resolveUrl(href),
            });
          }
        }
      );
    }

    return films;
  }

  /**
   * Check if text is a section heading (not a film title)
   */
  private isSectionHeading(text: string): boolean {
    const lower = text.toLowerCase().trim();

    // Exact match against known headings
    if (SECTION_HEADINGS.has(lower)) return true;

    // Pattern-based filtering
    if (lower.endsWith(" programme")) return true;
    if (lower.endsWith(" screenings")) return true;
    if (lower.endsWith(" screening") && !lower.includes(":")) return true;
    if (lower.startsWith("bfi ") && !lower.includes(":")) return true;

    return false;
  }

  /**
   * Resolve a relative URL to absolute
   */
  private resolveUrl(url: string): string {
    if (url.startsWith("http")) return url;
    if (url.startsWith("/")) {
      return `https://whatson.bfi.org.uk${url}`;
    }
    return `${this.config.baseUrl}/${url}`;
  }

  /**
   * Health check - verify seasons page is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Need to use Playwright for health check due to Cloudflare
      await this.initialize();

      if (!this.page) return false;

      const url = `${this.config.baseUrl}${this.config.seasonsPath}`;
      await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      const passed = await waitForCloudflare(this.page, 30);
      await this.cleanup();

      return passed;
    } catch {
      try {
        await this.cleanup();
      } catch {
        // Ignore cleanup errors
      }
      return false;
    }
  }
}

/**
 * Internal type for parsed season cards
 */
interface SeasonCard {
  name: string;
  permalink: string;
  detailUrl: string;
  posterUrl?: string;
}

/**
 * Factory function for creating BFI season scraper
 */
export function createBFISeasonScraper(): BFISeasonScraper {
  return new BFISeasonScraper();
}
