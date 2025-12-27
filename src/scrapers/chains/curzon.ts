/**
 * Curzon Cinemas Scraper
 * Uses Playwright to scrape showtimes from the Curzon website
 *
 * Website: https://www.curzon.com
 *
 * To add a new Curzon venue:
 * 1. Add venue config to CURZON_VENUES array below
 * 2. Find the venue's slug from their website URL
 */

import * as cheerio from "cheerio";
import type { ChainConfig, VenueConfig, RawScreening, ChainScraper } from "../types";
import { getBrowser, closeBrowser, createPage } from "../utils/browser";
import type { Page } from "playwright";

// ============================================================================
// Curzon Venue Configurations
// Add new venues here - just need the slug, name, and chainVenueId
// ============================================================================

export const CURZON_VENUES: VenueConfig[] = [
  {
    id: "curzon-soho",
    name: "Curzon Soho",
    shortName: "Curzon Soho",
    slug: "soho",
    area: "Soho",
    postcode: "W1D 5DY",
    address: "99 Shaftesbury Avenue",
    chainVenueId: "0000000002",
    features: ["bar", "cafe"],
    active: true,
  },
  {
    id: "curzon-mayfair",
    name: "Curzon Mayfair",
    shortName: "Curzon Mayfair",
    slug: "mayfair",
    area: "Mayfair",
    postcode: "W1J 7SH",
    address: "38 Curzon Street",
    chainVenueId: "0000000001",
    features: ["historic", "single_screen"],
    active: true,
  },
  {
    id: "curzon-bloomsbury",
    name: "Curzon Bloomsbury",
    shortName: "Curzon Blooms",
    slug: "bloomsbury",
    area: "Bloomsbury",
    postcode: "WC1H 8AG",
    address: "The Brunswick Centre",
    chainVenueId: "0000000003",
    features: ["bar"],
    active: true,
  },
  {
    id: "curzon-aldgate",
    name: "Curzon Aldgate",
    shortName: "Curzon Aldgate",
    slug: "aldgate",
    area: "Aldgate",
    postcode: "E1 8FA",
    address: "2 Whitechapel High Street",
    chainVenueId: "0000000006",
    features: ["bar", "rooftop"],
    active: true,
  },
  {
    id: "curzon-victoria",
    name: "Curzon Victoria",
    shortName: "Curzon Vic",
    slug: "victoria",
    area: "Victoria",
    postcode: "SW1E 5JA",
    address: "58 Victoria Street",
    chainVenueId: "0000000004",
    features: ["bar"],
    active: true,
  },
  {
    id: "curzon-hoxton",
    name: "Curzon Hoxton",
    shortName: "Curzon Hoxton",
    slug: "hoxton",
    area: "Hoxton",
    postcode: "N1 6NU",
    address: "58 Pitfield Street",
    chainVenueId: "0000000007",
    features: ["bar"],
    active: true,
  },
  {
    id: "curzon-kingston",
    name: "Curzon Kingston",
    shortName: "Curzon Kingston",
    slug: "kingston",
    area: "Kingston",
    postcode: "KT1 1QP",
    address: "Charter Quay",
    chainVenueId: "0000000009",
    active: true,
  },
  {
    id: "curzon-richmond",
    name: "Curzon Richmond",
    shortName: "Curzon Richmond",
    slug: "richmond",
    area: "Richmond",
    postcode: "TW9 1NE",
    address: "3 Water Lane",
    chainVenueId: "0000000005",
    active: true,
  },
  {
    id: "curzon-wimbledon",
    name: "Curzon Wimbledon",
    shortName: "Curzon Wimbledon",
    slug: "wimbledon",
    area: "Wimbledon",
    postcode: "SW19 8YA",
    address: "23 The Broadway",
    chainVenueId: "0000000008",
    active: true,
  },
  {
    id: "curzon-camden",
    name: "Curzon Camden",
    shortName: "Curzon Camden",
    slug: "camden",
    area: "Camden",
    postcode: "NW1 8QP",
    address: "Hawley Wharf",
    chainVenueId: "0000000010",
    active: true,
  },
];

// ============================================================================
// Chain Configuration
// ============================================================================

export const CURZON_CONFIG: ChainConfig = {
  chainId: "curzon",
  chainName: "Curzon",
  baseUrl: "https://www.curzon.com",
  venues: CURZON_VENUES,
  requestsPerMinute: 10,
  delayBetweenRequests: 3000,
};

// ============================================================================
// Curzon Scraper Implementation (uses Playwright due to JS rendering)
// ============================================================================

export class CurzonScraper implements ChainScraper {
  chainConfig = CURZON_CONFIG;
  private page: Page | null = null;

  /**
   * Scrape all active venues
   */
  async scrapeAll(): Promise<Map<string, RawScreening[]>> {
    const activeVenues = this.chainConfig.venues.filter(v => v.active !== false);
    return this.scrapeVenues(activeVenues.map(v => v.id));
  }

  /**
   * Scrape specific venues by ID
   */
  async scrapeVenues(venueIds: string[]): Promise<Map<string, RawScreening[]>> {
    const results = new Map<string, RawScreening[]>();

    try {
      await this.initialize();

      for (const venueId of venueIds) {
        const venue = this.chainConfig.venues.find(v => v.id === venueId);
        if (!venue) {
          console.warn(`[curzon] Unknown venue: ${venueId}`);
          continue;
        }

        console.log(`[curzon] Scraping ${venue.name}...`);
        const screenings = await this.scrapeVenue(venueId);
        results.set(venueId, screenings);

        // Rate limiting
        await new Promise(r => setTimeout(r, this.chainConfig.delayBetweenRequests));
      }
    } finally {
      await this.cleanup();
    }

    return results;
  }

  /**
   * Scrape single venue - scrapes multiple dates
   */
  async scrapeVenue(venueId: string): Promise<RawScreening[]> {
    const venue = this.chainConfig.venues.find(v => v.id === venueId);
    if (!venue) {
      console.error(`[curzon] Venue not found: ${venueId}`);
      return [];
    }

    if (!this.page) {
      await this.initialize();
    }

    const allScreenings: RawScreening[] = [];

    try {
      const url = `${this.chainConfig.baseUrl}/venues/${venue.slug}/`;
      await this.page!.goto(url, { waitUntil: "networkidle", timeout: 60000 });

      // Wait for content to load
      await this.page!.waitForTimeout(3000);

      // Try to close any popups/modals
      try {
        await this.page!.keyboard.press("Escape");
        await this.page!.waitForTimeout(500);
      } catch {
        // Ignore if no popup
      }

      // Get all date buttons
      const dateButtons = await this.page!.$$('[class*="date-picker"] button, [role="listitem"] button');
      const dateCount = Math.min(dateButtons.length, 14); // Scrape up to 14 days

      console.log(`[curzon] Found ${dateCount} dates to scrape`);

      // First, scrape the current page (already showing first date - no click needed)
      if (dateCount > 0) {
        try {
          const firstButton = dateButtons[0];
          const dateText = await firstButton.textContent();
          const dateInfo = this.parseDateFromButton(dateText || "");
          const html = await this.page!.content();
          const screenings = this.parseScreenings(html, venue, dateInfo);
          allScreenings.push(...screenings);
        } catch (error) {
          console.error(`[curzon] Error scraping first date for ${venue.name}:`, error);
        }
      }

      // Then click through remaining dates (starting from index 1)
      for (let i = 1; i < dateCount; i++) {
        try {
          // Re-query buttons as DOM may have changed
          const buttons = await this.page!.$$('[class*="date-picker"] button, [role="listitem"] button');
          if (i >= buttons.length) break;

          // Click the date button
          await buttons[i].click();
          await this.page!.waitForTimeout(2000);

          // Get the date text from the button
          const dateText = await buttons[i].textContent();
          const dateInfo = this.parseDateFromButton(dateText || "");

          // Get page HTML and parse screenings
          const html = await this.page!.content();
          const screenings = this.parseScreenings(html, venue, dateInfo);
          allScreenings.push(...screenings);

        } catch (error) {
          console.error(`[curzon] Error scraping date ${i} for ${venue.name}:`, error);
        }
      }

      console.log(`[curzon] ${venue.name}: ${allScreenings.length} screenings`);
      return this.deduplicate(allScreenings);

    } catch (error) {
      console.error(`[curzon] Error scraping ${venue.name}:`, error);
      return [];
    }
  }

  private async initialize(): Promise<void> {
    console.log(`[curzon] Launching browser...`);
    await getBrowser();
    this.page = await createPage();
  }

  private async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    await closeBrowser();
    console.log(`[curzon] Browser closed`);
  }

  /**
   * Parse date from button text like "Mon 22 Dec" or "Today"
   */
  private parseDateFromButton(text: string): Date {
    const now = new Date();

    if (text.toLowerCase().includes("today")) {
      return now;
    }

    // Try to parse "Mon 22 Dec" format
    const match = text.match(/(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
    if (match) {
      const day = parseInt(match[1]);
      const monthStr = match[2].toLowerCase();
      const months: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
      };
      const month = months[monthStr];
      const year = now.getFullYear();

      // If the date is in the past, assume next year
      const date = new Date(year, month, day);
      if (date < now) {
        date.setFullYear(year + 1);
      }
      return date;
    }

    return now;
  }

  /**
   * Parse screenings from page HTML
   */
  private parseScreenings(html: string, venue: VenueConfig, date: Date): RawScreening[] {
    const $ = cheerio.load(html);
    const screenings: RawScreening[] = [];

    // Find film containers - look for list items with film info
    $('ul[class*="film"] > li, [role="list"] > [role="listitem"]').each((_, filmEl) => {
      const $film = $(filmEl);

      // Extract film title from heading
      const title = $film.find('h3, h2[class*="title"], [class*="film-title"]').first().text().trim();
      if (!title || title.length < 2) return;

      // Find showtime links
      $film.find('a[href*="ticketing"], a[href*="seats"]').each((_, timeEl) => {
        const $time = $(timeEl);
        // IMPORTANT: Get full text of the link, not just <time> element
        // Curzon structure: <a><time>2:15</time>PM</a> - need both parts
        const timeText = $time.text().trim();
        const bookingUrl = $time.attr("href") || "";

        // Parse time from text like "12:00PM" or "12:00 PM"
        const timeMatch = timeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (!timeMatch) return;

        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const ampm = timeMatch[3]?.toUpperCase();

        // If no AM/PM specified and hour is 1-9, assume PM (cinema showtimes are usually afternoon/evening)
        // This handles edge cases where AM/PM might be missing
        if (!ampm && hours >= 1 && hours <= 9) {
          hours += 12;
        }

        if (ampm === "PM" && hours < 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;

        const datetime = new Date(date);
        datetime.setHours(hours, minutes, 0, 0);

        // Check for accessibility features
        const hasOpenCaption = $time.find('img[alt*="Caption"], [class*="caption"]').length > 0 ||
          timeText.toLowerCase().includes("caption");
        const hasAudioDesc = $time.find('img[alt*="Audio"], [class*="audio"]').length > 0 ||
          timeText.toLowerCase().includes("audio");

        let eventDescription: string | undefined;
        if (hasOpenCaption) eventDescription = "Open Captioned";
        if (hasAudioDesc) eventDescription = eventDescription ? `${eventDescription}, Audio Described` : "Audio Described";

        const sourceId = `curzon-${venue.id}-${title.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`;

        screenings.push({
          filmTitle: title,
          datetime,
          bookingUrl: bookingUrl.startsWith("http")
            ? bookingUrl
            : `${this.chainConfig.baseUrl}${bookingUrl}`,
          sourceId,
          eventDescription,
        });
      });
    });

    return screenings;
  }

  /**
   * Remove duplicate screenings
   */
  private deduplicate(screenings: RawScreening[]): RawScreening[] {
    const seen = new Set<string>();
    const now = new Date();

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
      const response = await fetch(this.chainConfig.baseUrl, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Factory function
export function createCurzonScraper(): CurzonScraper {
  return new CurzonScraper();
}

// Get active venues for easy reference
export function getActiveCurzonVenues(): VenueConfig[] {
  return CURZON_VENUES.filter(v => v.active !== false);
}

// Get all London Curzon venues (for adding to database)
export function getLondonCurzonVenues(): VenueConfig[] {
  const londonPostcodes = ["W1", "WC", "EC", "E1", "N1", "SW", "SE", "NW", "KT", "TW"];
  return CURZON_VENUES.filter(v =>
    v.postcode && londonPostcodes.some(p => v.postcode!.startsWith(p))
  );
}
