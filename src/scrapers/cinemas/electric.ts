// @ts-nocheck
/**
 * Electric Cinema Scraper
 *
 * Luxury cinema chain with two London locations
 * Website: https://www.electriccinema.co.uk
 *
 * Uses Playwright due to WordPress/JS rendering
 */

import * as cheerio from "cheerio";
import type { RawScreening, ScraperConfig, CinemaScraper, VenueConfig } from "../types";
import { getBrowser, closeBrowser, createPage } from "../utils/browser";
import type { Page } from "playwright";

// ============================================================================
// Electric Cinema Configuration
// ============================================================================

export const ELECTRIC_VENUES: VenueConfig[] = [
  {
    id: "electric-portobello",
    name: "Electric Cinema Portobello",
    shortName: "Electric Portobello",
    slug: "portobello",
    area: "Notting Hill",
    postcode: "W11 2ED",
    address: "191 Portobello Road",
    features: ["luxury", "historic", "bar", "beds"],
    active: true,
  },
  {
    id: "electric-white-city",
    name: "Electric Cinema White City",
    shortName: "Electric White City",
    slug: "white-city",
    area: "White City",
    postcode: "W12 7SL",
    address: "Television Centre",
    features: ["luxury", "bar", "beds"],
    active: true,
  },
];

export const ELECTRIC_CONFIG: ScraperConfig = {
  cinemaId: "electric",
  baseUrl: "https://www.electriccinema.co.uk",
  requestsPerMinute: 10,
  delayBetweenRequests: 3000,
};

// ============================================================================
// Electric Cinema Scraper Implementation
// ============================================================================

export class ElectricScraper implements CinemaScraper {
  config = ELECTRIC_CONFIG;
  private page: Page | null = null;

  async scrape(): Promise<RawScreening[]> {
    console.log(`[electric] Starting scrape...`);

    try {
      await this.initialize();
      const allScreenings: RawScreening[] = [];

      for (const venue of ELECTRIC_VENUES.filter(v => v.active)) {
        const venueScreenings = await this.scrapeVenue(venue);
        allScreenings.push(...venueScreenings);
        await new Promise(r => setTimeout(r, this.config.delayBetweenRequests));
      }

      await this.cleanup();

      const validated = this.validate(allScreenings);
      console.log(`[electric] Total: ${validated.length} valid screenings`);

      return validated;
    } catch (error) {
      console.error(`[electric] Scrape failed:`, error);
      await this.cleanup();
      throw error;
    }
  }

  private async scrapeVenue(venue: VenueConfig): Promise<RawScreening[]> {
    if (!this.page) throw new Error("Browser not initialized");

    const url = `${this.config.baseUrl}/programme/list/${venue.slug}/`;
    console.log(`[electric] Scraping ${venue.name}...`);

    try {
      await this.page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await this.page.waitForTimeout(2000);

      const html = await this.page.content();
      return this.parseScreenings(html, venue);
    } catch (error) {
      console.error(`[electric] Error scraping ${venue.name}:`, error);
      return [];
    }
  }

  private async initialize(): Promise<void> {
    console.log(`[electric] Launching browser...`);
    await getBrowser();
    this.page = await createPage();
  }

  private async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    await closeBrowser();
  }

  private parseScreenings(html: string, venue: VenueConfig): RawScreening[] {
    const $ = cheerio.load(html);
    const screenings: RawScreening[] = [];

    // Electric uses WordPress with custom blocks
    // Look for film entries and showtime data
    $(".film-item, .programme-item, article, [class*='film']").each((_, el) => {
      const $film = $(el);

      // Extract title
      const title = $film.find("h2, h3, .film-title, [class*='title']").first().text().trim();
      if (!title || title.length < 2) return;

      // Look for date/time info
      const dateTimeText = $film.text();

      // Find showtime links
      $film.find("a[href*='book'], a[href*='tickets'], .showtime").each((_, timeEl) => {
        const $time = $(timeEl);
        const timeText = $time.text().trim();
        const bookingUrl = $time.attr("href") || "";

        const datetime = this.extractDateTime(dateTimeText, timeText);
        if (!datetime) return;

        screenings.push({
          filmTitle: title,
          datetime,
          bookingUrl: bookingUrl.startsWith("http")
            ? bookingUrl
            : `${this.config.baseUrl}${bookingUrl}`,
          sourceId: `electric-${venue.id}-${title.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`,
        });
      });
    });

    // Also try parsing from general content
    if (screenings.length === 0) {
      return this.parseFromContent($ as cheerio.CheerioAPI, venue);
    }

    console.log(`[electric] ${venue.name}: ${screenings.length} screenings`);
    return screenings;
  }

  private parseFromContent($: cheerio.CheerioAPI, venue: VenueConfig): RawScreening[] {
    const screenings: RawScreening[] = [];
    const content = $("main, .content, article").text();

    // Look for patterns like "Film Title - 14:30" or dated sections
    const filmPattern = /([A-Z][A-Za-z\s:'-]+)\s*[-–]\s*(\d{1,2}):(\d{2})/g;
    let match;

    while ((match = filmPattern.exec(content)) !== null) {
      const title = match[1].trim();
      const hours = parseInt(match[2]);
      const minutes = parseInt(match[3]);

      if (title.length < 3 || title.length > 100) continue;

      // Create datetime (assume today or next occurrence)
      const now = new Date();
      const datetime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);

      if (datetime < now) {
        datetime.setDate(datetime.getDate() + 1);
      }

      screenings.push({
        filmTitle: title,
        datetime,
        bookingUrl: `${this.config.baseUrl}/programme/list/${venue.slug}/`,
        sourceId: `electric-${venue.id}-${title.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`,
      });
    }

    return screenings;
  }

  private extractDateTime(contextText: string, timeText: string): Date | null {
    // Extract time
    const timeMatch = timeText.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i) ||
                      contextText.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!timeMatch) return null;

    // Extract date
    const dateMatch = contextText.match(
      /(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)/i
    );

    const months: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3,
      may: 4, june: 5, july: 6, august: 7,
      september: 8, october: 9, november: 10, december: 11,
    };

    let day: number;
    let month: number;
    const year = new Date().getFullYear();

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

export function createElectricScraper(): ElectricScraper {
  return new ElectricScraper();
}
