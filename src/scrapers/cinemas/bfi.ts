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

  private async waitForCloudflare(maxWaitSeconds = 45): Promise<boolean> {
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
    console.log(`[${this.config.cinemaId}] Cloudflare challenge timeout after ${maxWaitSeconds}s`);
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

    try {
      // Navigate to the calendar page first
      console.log(`[${this.config.cinemaId}] Opening calendar...`);

      // The calendar is at the main whatson page
      await this.page.goto(`${this.venue.baseUrl}/default.asp`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      const cloudflareCleared = await this.waitForCloudflare(45);
      if (!cloudflareCleared) {
        console.log(`[${this.config.cinemaId}] Cloudflare did not clear, trying anyway...`);
      }

      await this.page.waitForTimeout(3000);

      // Debug: Log the page title and URL
      const title = await this.page.title();
      const url = this.page.url();
      console.log(`[${this.config.cinemaId}] Page title: "${title}", URL: ${url}`);

      // Try waiting for calendar to appear - various selectors
      const calendarSelectors = [
        '[role="grid"]',
        '[role="gridcell"]',
        '.calendar',
        '[class*="calendar"]',
        '[class*="datepicker"]',
        'table',
      ];

      let calendarFound = false;
      for (const selector of calendarSelectors) {
        const exists = await this.page.$(selector);
        if (exists) {
          console.log(`[${this.config.cinemaId}] Found element matching: ${selector}`);
          calendarFound = true;
          break;
        }
      }

      if (!calendarFound) {
        // Debug: Log snippet of HTML to understand page structure
        const html = await this.page.content();
        console.log(`[${this.config.cinemaId}] No calendar found. Page HTML length: ${html.length}`);
        console.log(`[${this.config.cinemaId}] HTML preview: ${html.substring(0, 500)}...`);

        // Try alternative: look for film listings directly on the page
        return this.parseSearchResults(html);
      }

      // Debug: Inspect grid structure
      const gridHtml = await this.page.$eval('[role="grid"]', el => el.outerHTML.substring(0, 2000)).catch(() => "grid not found");
      console.log(`[${this.config.cinemaId}] Grid HTML preview: ${gridHtml.substring(0, 500)}...`);

      // Try multiple selector patterns for calendar cells
      const cellSelectors = [
        '[role="gridcell"][aria-disabled="false"]',
        '[role="gridcell"]:not([aria-disabled="true"])',
        '[role="gridcell"]',
        '[role="grid"] button',
        '[role="grid"] a',
        '.calendar-day',
        '[class*="day"]',
      ];

      let dateCells: any[] = [];
      let usedSelector = "";
      for (const selector of cellSelectors) {
        const cells = await this.page.$$(selector);
        console.log(`[${this.config.cinemaId}] Selector "${selector}" found ${cells.length} elements`);
        if (cells.length > 0 && dateCells.length === 0) {
          dateCells = cells;
          usedSelector = selector;
        }
      }
      console.log(`[${this.config.cinemaId}] Using selector: ${usedSelector}, found ${dateCells.length} active calendar dates`);

      // Use the working selector in the loop
      const workingSelector = usedSelector || '[role="gridcell"]:not([aria-disabled="true"])';
      console.log(`[${this.config.cinemaId}] Starting date loop with ${dateCells.length} dates...`);

      for (let i = 0; i < Math.min(dateCells.length, 30); i++) {
        try {
          // Re-query date cells after each navigation since DOM changes
          const currentCells = await this.page.$$(workingSelector);
          console.log(`[${this.config.cinemaId}] Re-queried: ${currentCells.length} cells for iteration ${i}`);
          if (i >= currentCells.length) break;

          const cell = currentCells[i];
          const dateLabel = await cell.getAttribute("aria-label") || await cell.textContent() || "";

          console.log(`[${this.config.cinemaId}] Clicking date: ${dateLabel.trim() || `cell ${i}`}...`);

          // Click the date cell
          await cell.click();
          await this.page.waitForTimeout(2000);

          // Wait for content to load
          await this.waitForCloudflare(10);

          try {
            await this.page.waitForSelector("main", { timeout: 5000 });
          } catch {
            // Continue even if main not found
          }

          await this.page.waitForTimeout(1000);

          const html = await this.page.content();

          // Debug: Show what we got after clicking
          const pageUrl = this.page.url();
          console.log(`[${this.config.cinemaId}] After click - URL: ${pageUrl}, HTML length: ${html.length}`);

          // Debug: Check for screening-like content
          const hasMain = html.includes('<main');
          const hasLoadArticle = html.includes('loadArticle');
          const hasGeneric = html.includes('generic');
          console.log(`[${this.config.cinemaId}] Page content: main=${hasMain}, loadArticle=${hasLoadArticle}, generic=${hasGeneric}`);

          const dayScreenings = this.parseSearchResults(html);
          console.log(`[${this.config.cinemaId}] Parsed ${dayScreenings.length} screenings from this date`);

          if (dayScreenings.length > 0) {
            console.log(`[${this.config.cinemaId}] ${dateLabel.trim()}: ${dayScreenings.length} screenings`);
            screenings.push(...dayScreenings);
          }

          // Navigate back to calendar for next date
          await this.page.goto(`${this.venue.baseUrl}/default.asp`, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
          await this.waitForCloudflare(10);
          await this.page.waitForTimeout(1500);

        } catch (error) {
          console.error(`[${this.config.cinemaId}] Error on date ${i}:`, error);
          // Try to recover by going back to calendar
          try {
            await this.page.goto(`${this.venue.baseUrl}/default.asp`, {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            });
            await this.page.waitForTimeout(2000);
          } catch {
            // Ignore recovery errors
          }
        }
      }
    } catch (error) {
      console.error(`[${this.config.cinemaId}] Calendar navigation failed:`, error);
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

    // BFI search results structure:
    // Links with loadArticle in href point to film/event pages
    // The datetime and screen info is in sibling/parent elements
    // Note: Page may not have <main> element - search for loadArticle links directly

    // Find all links that point to articles (film/event pages)
    const loadArticleLinks = $('a[href*="loadArticle"]');
    console.log(`[${this.config.cinemaId}] Found ${loadArticleLinks.length} loadArticle links`);

    let processedCount = 0;
    loadArticleLinks.each((idx, el) => {
      const $link = $(el);
      const title = $link.text().trim();
      const href = $link.attr("href") || "";

      // Debug: log first few links
      if (idx < 3) {
        console.log(`[${this.config.cinemaId}] Link ${idx}: title="${title.substring(0, 50)}", href contains loadArticle`);
      }

      // Skip empty, short titles, and navigation links
      if (!title || title.length < 3) return;
      if (href.includes("javascript:")) return;

      // Skip non-film items
      if (this.isNonFilmEvent(title)) return;

      processedCount++;

      // Get the parent container to find datetime and screen
      // Structure: generic > generic > [link, datetime div, screen div]
      const $container = $link.parent();
      const $grandparent = $container.parent();

      // Try to find datetime in container text or grandparent
      const containerText = $container.text();
      const grandparentText = $grandparent.text();

      // Debug: log structure for first few
      if (processedCount <= 3) {
        console.log(`[${this.config.cinemaId}] Processing "${title.substring(0, 30)}...": container="${containerText.substring(0, 100)}..."`);
      }

      // Find datetime from sibling elements
      let datetimeStr = "";
      let screen = "";

      // First try to match from the grandparent text (which includes siblings)
      const datetimePattern = /(\w+)\s+(\d{1,2})\s+(\w+)\s+(\d{4})\s+(\d{1,2}:\d{2})/;
      const dtMatch = grandparentText.match(datetimePattern);
      if (dtMatch) {
        datetimeStr = dtMatch[0];
      }

      // Also look for screen info
      const screenMatch = grandparentText.match(/(NFT[1-4]|IMAX|Studio|BFI Reuben Library)/i);
      if (screenMatch) {
        screen = screenMatch[1];
      }

      if (!datetimeStr) {
        if (processedCount <= 3) {
          console.log(`[${this.config.cinemaId}] No datetime found in: "${grandparentText.substring(0, 200)}..."`);
        }
        return;
      }

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
