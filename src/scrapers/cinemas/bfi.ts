/**
 * BFI Southbank & BFI IMAX Scraper
 * Uses Playwright with stealth plugin to bypass Cloudflare protection
 * Iterates through dates to fetch complete listings
 */

import * as cheerio from "cheerio";
import type { RawScreening, ScraperConfig } from "../types";
import { getBrowser, closeBrowser, createPage } from "../utils/browser";
import type { Page } from "playwright";

interface BFIVenueConfig {
  id: "bfi-southbank" | "bfi-imax";
  name: string;
  baseUrl: string;
}

const VENUES: Record<string, BFIVenueConfig> = {
  "bfi-southbank": {
    id: "bfi-southbank",
    name: "BFI Southbank",
    baseUrl: "https://whatson.bfi.org.uk/Online",
  },
  "bfi-imax": {
    id: "bfi-imax",
    name: "BFI IMAX",
    baseUrl: "https://whatson.bfi.org.uk/imax/Online",
  },
};

export class BFIScraper {
  private venue: BFIVenueConfig;
  private page: Page | null = null;

  config: ScraperConfig;

  constructor(venueId: "bfi-southbank" | "bfi-imax" = "bfi-southbank") {
    this.venue = VENUES[venueId];
    this.config = {
      cinemaId: venueId,
      baseUrl: this.venue.baseUrl,
      requestsPerMinute: 10,
      delayBetweenRequests: 3000, // Increased for Cloudflare
    };
  }

  async scrape(): Promise<RawScreening[]> {
    console.log(`[${this.config.cinemaId}] Starting scrape with Playwright stealth mode...`);

    try {
      await this.initialize();
      const screenings = await this.fetchAllDates();
      await this.cleanup();

      const validated = this.validate(screenings);
      console.log(`[${this.config.cinemaId}] Found ${validated.length} valid screenings`);
      return validated;
    } catch (error) {
      console.error(`[${this.config.cinemaId}] Scrape failed:`, error);
      await this.cleanup();
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    console.log(`[${this.config.cinemaId}] Launching browser with stealth mode...`);
    await getBrowser();
    this.page = await createPage();

    // First visit the homepage to establish session/cookies and bypass initial Cloudflare
    console.log(`[${this.config.cinemaId}] Warming up session on homepage...`);
    await this.page.goto(this.venue.baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Wait for Cloudflare challenge if present
    await this.waitForCloudflare();

    // Wait for page to settle
    await this.page.waitForTimeout(3000);
    console.log(`[${this.config.cinemaId}] Session established`);
  }

  private async waitForCloudflare(maxWaitSeconds = 20): Promise<boolean> {
    if (!this.page) return false;

    for (let i = 0; i < maxWaitSeconds; i++) {
      const html = await this.page.content();
      if (!html.includes("challenge-platform") && !html.includes("Checking your browser")) {
        return true;
      }
      if (i === 0) {
        console.log(`[${this.config.cinemaId}] Cloudflare challenge detected, waiting...`);
      }
      await this.page.waitForTimeout(1000);
    }
    console.log(`[${this.config.cinemaId}] Cloudflare challenge timeout`);
    return false;
  }

  private async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    await closeBrowser();
    console.log(`[${this.config.cinemaId}] Browser closed`);
  }

  private async fetchAllDates(): Promise<RawScreening[]> {
    if (!this.page) throw new Error("Browser not initialized");

    const screenings: RawScreening[] = [];
    const dates = this.generateDateRange(30); // 30 days ahead

    for (const date of dates) {
      try {
        const dateStr = this.formatDate(date);
        console.log(`[${this.config.cinemaId}] Fetching ${dateStr}...`);

        // Click on the date in the calendar or navigate directly
        const url = this.buildSearchUrl(dateStr);
        await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

        // Wait for Cloudflare if needed
        const passed = await this.waitForCloudflare(10);
        if (!passed) {
          console.log(`[${this.config.cinemaId}] Skipping ${dateStr} - Cloudflare blocked`);
          continue;
        }

        // Wait for main content
        try {
          await this.page.waitForSelector("main", { timeout: 5000 });
        } catch {
          // Continue even if main not found immediately
        }

        await this.page.waitForTimeout(1000);

        const html = await this.page.content();
        const dayScreenings = this.parseSearchResults(html);

        if (dayScreenings.length > 0) {
          console.log(`[${this.config.cinemaId}] ${dateStr}: ${dayScreenings.length} screenings`);
          screenings.push(...dayScreenings);
        } else {
          console.log(`[${this.config.cinemaId}] ${dateStr}: no screenings`);
        }

        // Rate limiting
        await this.page.waitForTimeout(this.config.delayBetweenRequests);
      } catch (error) {
        console.error(`[${this.config.cinemaId}] Error on ${this.formatDate(date)}:`, error);
      }
    }

    return screenings;
  }

  private generateDateRange(days: number): Date[] {
    const dates: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    return dates;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0]; // YYYY-MM-DD
  }

  private buildSearchUrl(date: string): string {
    // Use the URL pattern discovered from MCP Playwright exploration
    const params = new URLSearchParams({
      "doWork::WScontent::search": "1",
      "BOset::WScontent::SearchCriteria::search_from": date,
      "BOset::WScontent::SearchCriteria::search_to": date,
    });
    return `${this.venue.baseUrl}/default.asp?${params.toString()}`;
  }

  private parseSearchResults(html: string): RawScreening[] {
    const $ = cheerio.load(html);
    const screenings: RawScreening[] = [];
    const now = new Date();

    // Check if we hit Cloudflare
    if (html.includes("challenge-platform") || html.includes("Checking your browser")) {
      return [];
    }

    // BFI search results structure (from MCP Playwright exploration):
    // main > generic > [generic containers per screening]
    // Each screening container has:
    //   - div with: link (title), div (datetime), div (screen)
    //   - div "Buy" button
    //
    // The links have hrefs containing "loadArticle"

    // Find all links that point to articles (film/event pages)
    $("main a").each((_, el) => {
      const $link = $(el);
      const title = $link.text().trim();
      const href = $link.attr("href") || "";

      // Skip empty, short titles, and navigation links
      if (!title || title.length < 3) return;
      if (href.includes("javascript:")) return;

      // Only process film/event links (contain loadArticle)
      if (!href.includes("loadArticle")) return;

      // Skip non-film items
      if (this.isNonFilmEvent(title)) return;

      // Get the parent container to find datetime and screen
      // Structure: generic > generic > [link, datetime div, screen div]
      const $container = $link.parent();
      const siblings = $container.children();

      // Find datetime from sibling elements
      let datetimeStr = "";
      let screen = "";

      siblings.each((_, sibling) => {
        const text = $(sibling).text().trim();

        // Look for datetime pattern: "Friday 19 December 2025 14:30"
        if (/\w+\s+\d{1,2}\s+\w+\s+\d{4}\s+\d{1,2}:\d{2}/.test(text)) {
          datetimeStr = text;
        }
        // Look for screen: NFT1-4, IMAX, Studio, etc.
        else if (/^(NFT[1-4]|IMAX|Studio|BFI Reuben Library)$/i.test(text)) {
          screen = text;
        }
      });

      if (!datetimeStr) return;

      const datetime = this.parseBFIDateTime(datetimeStr);
      if (!datetime || datetime < now) return;

      // Build booking URL
      const bookingUrl = href.startsWith("http")
        ? href
        : `${this.venue.baseUrl}/${href}`;

      // Detect special event types from title
      let eventType: string | undefined;
      const cleanTitle = this.cleanTitle(title);

      if (/\+\s*Q\s*&?\s*A/i.test(title)) eventType = "q_and_a";
      else if (/\+\s*intro/i.test(title)) eventType = "intro";
      else if (/\+\s*discussion/i.test(title)) eventType = "discussion";
      else if (/preview/i.test(title)) eventType = "preview";
      else if (/premiere/i.test(title)) eventType = "premiere";

      screenings.push({
        filmTitle: cleanTitle,
        datetime,
        screen: screen || undefined,
        bookingUrl,
        eventType,
        sourceId: `${this.config.cinemaId}-${cleanTitle.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`,
      });
    });

    return screenings;
  }

  private isNonFilmEvent(title: string): boolean {
    const skipPatterns = [
      /^library/i,
      /auction/i,
      /members?\s+(only|event|screening)/i,
      /research\s+session/i,
      /workshop/i,
      /^talk\s*$/i,
      /lecture/i,
    ];
    return skipPatterns.some((p) => p.test(title));
  }

  private parseBFIDateTime(text: string): Date | null {
    // Format: "Friday 19 December 2025 14:30"
    const match = text.match(/(\d{1,2})\s+(\w+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (!match) return null;

    const [, day, monthName, year, hours, minutes] = match;

    const months: Record<string, number> = {
      January: 0, February: 1, March: 2, April: 3,
      May: 4, June: 5, July: 6, August: 7,
      September: 8, October: 9, November: 10, December: 11,
    };

    const month = months[monthName];
    if (month === undefined) return null;

    return new Date(
      parseInt(year),
      month,
      parseInt(day),
      parseInt(hours),
      parseInt(minutes)
    );
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/\s*\+\s*(Q\s*&?\s*A|intro|discussion|panel).*$/i, "")
      .replace(/^(Preview|UK Premiere|Premiere)[:\s]+/i, "")
      .replace(/\s*\(.*?\)\s*$/, "")
      .trim();
  }

  private validate(screenings: RawScreening[]): RawScreening[] {
    const now = new Date();
    const seen = new Set<string>();

    return screenings.filter((s) => {
      if (!s.filmTitle || s.filmTitle.trim() === "") return false;
      if (!s.datetime || isNaN(s.datetime.getTime())) return false;
      if (s.datetime < now) return false;
      if (!s.bookingUrl || s.bookingUrl.trim() === "") return false;

      // Deduplicate by sourceId
      if (s.sourceId && seen.has(s.sourceId)) return false;
      if (s.sourceId) seen.add(s.sourceId);

      return true;
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      console.log(`[${this.config.cinemaId}] Running health check...`);
      const page = await createPage();

      await page.goto(this.venue.baseUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Wait for potential Cloudflare challenge
      for (let i = 0; i < 15; i++) {
        const html = await page.content();
        if (!html.includes("challenge-platform") && !html.includes("Checking your browser")) {
          break;
        }
        await page.waitForTimeout(1000);
      }

      const title = await page.title();
      await page.close();
      await closeBrowser();

      return title.toLowerCase().includes("bfi");
    } catch (error) {
      console.error(`[${this.config.cinemaId}] Health check failed:`, error);
      await closeBrowser();
      return false;
    }
  }
}

export function createBFIScraper(venueId: "bfi-southbank" | "bfi-imax"): BFIScraper {
  return new BFIScraper(venueId);
}
