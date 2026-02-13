/**
 * BFI Southbank & BFI IMAX Scraper
 * Uses Playwright with stealth plugin to bypass Cloudflare protection
 * Iterates through dates to fetch complete listings
 */

import * as cheerio from "cheerio";
import type { RawScreening, ScraperConfig } from "../types";
import { getBrowser, closeBrowser, createPage, waitForCloudflare } from "../utils/browser";
import type { Page } from "playwright";
import { parseFilmMetadata } from "../utils/metadata-parser";
import { FestivalDetector } from "../festivals/festival-detector";

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
    await FestivalDetector.preload();

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
    console.log(`[${this.config.cinemaId}] Launching browser with enhanced stealth mode...`);
    await getBrowser();
    this.page = await createPage();

    // First visit the homepage to establish session/cookies and bypass initial Cloudflare
    console.log(`[${this.config.cinemaId}] Warming up session on homepage...`);
    await this.page.goto(this.venue.baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Wait for Cloudflare challenge if present (uses enhanced human-like behavior)
    const passed = await waitForCloudflare(this.page, 60);
    if (!passed) {
      console.log(`[${this.config.cinemaId}] Cloudflare challenge timeout, continuing anyway...`);
    }

    // Wait for page to settle
    await this.page.waitForTimeout(2000);
    console.log(`[${this.config.cinemaId}] Session established`);
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

      await this.page.goto(`${this.venue.baseUrl}/default.asp`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      const cloudflareCleared = await waitForCloudflare(this.page, 45);
      if (!cloudflareCleared) {
        console.log(`[${this.config.cinemaId}] Cloudflare did not clear, trying anyway...`);
      }

      await this.page.waitForTimeout(3000);

      // Navigate to months with future screenings
      // Need enough active dates to indicate a real month of programming (not just stale past dates)
      const minActiveDatesThreshold = 5;
      const maxMonthsToAdvance = 3;
      for (let monthOffset = 0; monthOffset < maxMonthsToAdvance; monthOffset++) {
        // Check if current month has enough active dates
        const activeCells = await this.page.$$('[role="gridcell"]:not([aria-disabled="true"])');

        if (activeCells.length >= minActiveDatesThreshold) {
          console.log(`[${this.config.cinemaId}] Found ${activeCells.length} active dates in current month view`);
          break;
        }

        console.log(`[${this.config.cinemaId}] Only ${activeCells.length} active dates (need ${minActiveDatesThreshold}+), advancing...`);

        // Not enough active dates, try next month
        const nextMonthBtn = this.page.getByRole('button', { name: 'Next month' });
        if (await nextMonthBtn.count() > 0) {
          console.log(`[${this.config.cinemaId}] Clicking Next month...`);
          await nextMonthBtn.click();
          await this.page.waitForTimeout(1500);
        } else {
          console.log(`[${this.config.cinemaId}] Next month button not found`);
          break;
        }
      }

      // Now scrape up to 2 months of calendar data
      for (let monthNum = 0; monthNum < 2; monthNum++) {
        console.log(`[${this.config.cinemaId}] Scraping month ${monthNum + 1}...`);

        // Get all clickable date cells
        const dateCells = await this.page.$$('[role="gridcell"]:not([aria-disabled="true"])');
        console.log(`[${this.config.cinemaId}] Found ${dateCells.length} active dates`);

        // Click each date to get screenings
        for (let i = 0; i < dateCells.length; i++) {
          try {
            // Re-query cells after navigation
            const currentCells = await this.page.$$('[role="gridcell"]:not([aria-disabled="true"])');
            if (i >= currentCells.length) break;

            const cell = currentCells[i];
            const dateLabel = await cell.getAttribute("aria-label") || await cell.textContent() || "";

            console.log(`[${this.config.cinemaId}] Clicking: ${dateLabel.trim()}...`);

            await cell.click();
            await this.page.waitForTimeout(2000);
            await waitForCloudflare(this.page, 10);

            const html = await this.page.content();
            const dayScreenings = this.parseSearchResults(html);

            if (dayScreenings.length > 0) {
              console.log(`[${this.config.cinemaId}] ${dateLabel.trim()}: ${dayScreenings.length} screenings`);
              screenings.push(...dayScreenings);
            }

            // Return to calendar
            await this.page.goto(`${this.venue.baseUrl}/default.asp`, {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            });
            await waitForCloudflare(this.page, 10);
            await this.page.waitForTimeout(1500);

            // Navigate back to the same month we were scraping
            for (let m = 0; m <= monthNum; m++) {
              const nextBtn = this.page.getByRole('button', { name: 'Next month' });
              if (await nextBtn.count() > 0) {
                await nextBtn.click();
                await this.page.waitForTimeout(1000);
              }
            }
          } catch (error) {
            console.error(`[${this.config.cinemaId}] Error on date ${i}:`, error);
            // Try to recover
            await this.page.goto(`${this.venue.baseUrl}/default.asp`, {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            }).catch(() => {});
            await this.page.waitForTimeout(2000);
          }
        }

        // Move to next month for next iteration
        const nextMonthButton = this.page.getByRole('button', { name: 'Next month' });
        if (await nextMonthButton.count() > 0) {
          await nextMonthButton.click();
          await this.page.waitForTimeout(1500);
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
    // BFI uses YYYY-M-D format (no leading zeros)
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}-${month}-${day}`;
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

      // Extract director/year from the listing text
      // BFI often includes "Dir. Name" and year in the description
      const metadata = parseFilmMetadata(grandparentText);

      screenings.push({
        filmTitle: cleanTitle,
        datetime,
        screen: screen || undefined,
        bookingUrl,
        eventType,
        sourceId: `${this.config.cinemaId}-${cleanTitle.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`,
        // Pass extracted metadata for better TMDB matching
        year: metadata.year,
        director: metadata.director,
        // Detect festival based on title/date
        ...FestivalDetector.detect(this.config.cinemaId, cleanTitle, datetime, bookingUrl),
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
