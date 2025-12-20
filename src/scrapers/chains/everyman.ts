/**
 * Everyman Cinemas Scraper
 *
 * Everyman uses a similar system to other chains
 * Website: https://www.everymancinema.com
 *
 * To add a new Everyman venue:
 * 1. Add venue config to EVERYMAN_VENUES array below
 * 2. Find the venue's slug from their website
 */

import * as cheerio from "cheerio";
import type { ChainConfig, VenueConfig, RawScreening, ChainScraper } from "../types";
import { getBrowser, closeBrowser, createPage } from "../utils/browser";
import type { Page } from "playwright";

// ============================================================================
// Everyman Venue Configurations - London Locations
// ============================================================================

export const EVERYMAN_VENUES: VenueConfig[] = [
  {
    id: "everyman-baker-street",
    name: "Everyman Baker Street",
    shortName: "Everyman Baker St",
    slug: "baker-street",
    area: "Marylebone",
    postcode: "W1U 6AG",
    address: "96-98 Baker Street",
    features: ["bar", "food"],
    active: true,
  },
  {
    id: "everyman-barnet",
    name: "Everyman Barnet",
    shortName: "Everyman Barnet",
    slug: "barnet",
    area: "Barnet",
    postcode: "EN5 5SJ",
    address: "Great North Road",
    features: ["bar"],
    active: true,
  },
  {
    id: "everyman-belsize-park",
    name: "Everyman Belsize Park",
    shortName: "Everyman Belsize",
    slug: "belsize-park",
    area: "Belsize Park",
    postcode: "NW3 4QG",
    address: "203 Haverstock Hill",
    features: ["historic", "bar"],
    active: true,
  },
  {
    id: "everyman-borough-yards",
    name: "Everyman Borough Yards",
    shortName: "Everyman Borough",
    slug: "borough-yards",
    area: "Borough",
    postcode: "SE1 9PH",
    address: "Borough Yards",
    features: ["bar", "food"],
    active: true,
  },
  {
    id: "everyman-broadgate",
    name: "Everyman Broadgate",
    shortName: "Everyman Broadgate",
    slug: "broadgate",
    area: "Liverpool Street",
    postcode: "EC2M 2QS",
    address: "Broadgate Circle",
    features: ["bar"],
    active: true,
  },
  {
    id: "everyman-canary-wharf",
    name: "Everyman Canary Wharf",
    shortName: "Everyman Canary",
    slug: "canary-wharf",
    area: "Canary Wharf",
    postcode: "E14 5NY",
    address: "Crossrail Place",
    features: ["bar", "food"],
    active: true,
  },
  {
    id: "everyman-chelsea",
    name: "Everyman Chelsea",
    shortName: "Everyman Chelsea",
    slug: "chelsea",
    area: "Chelsea",
    postcode: "SW3 3TD",
    address: "279 King's Road",
    features: ["bar"],
    active: true,
  },
  {
    id: "everyman-crystal-palace",
    name: "Everyman Crystal Palace",
    shortName: "Everyman Crystal",
    slug: "crystal-palace",
    area: "Crystal Palace",
    postcode: "SE19 2AE",
    address: "25 Church Road",
    features: ["bar"],
    active: true,
  },
  {
    id: "everyman-hampstead",
    name: "Everyman Hampstead",
    shortName: "Everyman Hampstead",
    slug: "hampstead",
    area: "Hampstead",
    postcode: "NW3 1QE",
    address: "5 Holly Bush Vale",
    features: ["historic", "bar"],
    active: true,
  },
  {
    id: "everyman-kings-cross",
    name: "Everyman King's Cross",
    shortName: "Everyman Kings X",
    slug: "kings-cross",
    area: "King's Cross",
    postcode: "N1C 4AG",
    address: "Coal Drops Yard",
    features: ["bar", "food"],
    active: true,
  },
  {
    id: "everyman-maida-vale",
    name: "Everyman Maida Vale",
    shortName: "Everyman Maida",
    slug: "maida-vale",
    area: "Maida Vale",
    postcode: "W9 1TT",
    address: "215 Sutherland Avenue",
    features: ["bar"],
    active: true,
  },
  {
    id: "everyman-muswell-hill",
    name: "Everyman Muswell Hill",
    shortName: "Everyman Muswell",
    slug: "muswell-hill",
    area: "Muswell Hill",
    postcode: "N10 3TD",
    address: "Fortis Green Road",
    features: ["bar"],
    active: true,
  },
  {
    id: "screen-on-the-green",
    name: "Screen on the Green",
    shortName: "Screen Green",
    slug: "screen-on-the-green",
    area: "Islington",
    postcode: "N1 0PH",
    address: "83 Upper Street",
    features: ["historic", "single_screen", "bar"],
    active: true,
  },
  {
    id: "everyman-stratford",
    name: "Everyman Stratford International",
    shortName: "Everyman Stratford",
    slug: "stratford-international",
    area: "Stratford",
    postcode: "E20 1GL",
    address: "International Way",
    features: ["bar"],
    active: true,
  },
  {
    id: "everyman-walthamstow",
    name: "Everyman Walthamstow",
    shortName: "Everyman Waltham",
    slug: "walthamstow",
    area: "Walthamstow",
    postcode: "E17 7JN",
    address: "186 Hoe Street",
    features: ["bar"],
    active: true,
  },
];

// ============================================================================
// Chain Configuration
// ============================================================================

export const EVERYMAN_CONFIG: ChainConfig = {
  chainId: "everyman",
  chainName: "Everyman",
  baseUrl: "https://www.everymancinema.com",
  venues: EVERYMAN_VENUES,
  requestsPerMinute: 10,
  delayBetweenRequests: 3000,
};

// ============================================================================
// Everyman Scraper Implementation (uses Playwright due to JS rendering)
// ============================================================================

export class EverymanScraper implements ChainScraper {
  chainConfig = EVERYMAN_CONFIG;
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
          console.warn(`[everyman] Unknown venue: ${venueId}`);
          continue;
        }

        console.log(`[everyman] Scraping ${venue.name}...`);
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
   * Scrape single venue
   */
  async scrapeVenue(venueId: string): Promise<RawScreening[]> {
    const venue = this.chainConfig.venues.find(v => v.id === venueId);
    if (!venue) {
      console.error(`[everyman] Venue not found: ${venueId}`);
      return [];
    }

    if (!this.page) {
      await this.initialize();
    }

    try {
      const url = `${this.chainConfig.baseUrl}/venues/${venue.slug}/listings`;
      await this.page!.goto(url, { waitUntil: "networkidle", timeout: 30000 });

      // Wait for content to load
      await this.page!.waitForTimeout(2000);

      const html = await this.page!.content();
      const screenings = this.parseScreenings(html, venue);

      console.log(`[everyman] ${venue.name}: ${screenings.length} screenings`);
      return screenings;
    } catch (error) {
      console.error(`[everyman] Error scraping ${venue.name}:`, error);
      return [];
    }
  }

  private async initialize(): Promise<void> {
    console.log(`[everyman] Launching browser...`);
    await getBrowser();
    this.page = await createPage();
  }

  private async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    await closeBrowser();
    console.log(`[everyman] Browser closed`);
  }

  private parseScreenings(html: string, venue: VenueConfig): RawScreening[] {
    const $ = cheerio.load(html);
    const screenings: RawScreening[] = [];

    // Everyman typically lists films with showtimes
    // Look for film containers and showtime elements
    $("[class*='film'], [class*='movie'], article").each((_, filmEl) => {
      const $film = $(filmEl);

      // Extract film title
      const title = $film.find("h2, h3, [class*='title']").first().text().trim();
      if (!title || title.length < 2) return;

      // Find showtimes within this film container
      $film.find("[class*='showtime'], [class*='session'], a[href*='book']").each((_, timeEl) => {
        const $time = $(timeEl);
        const timeText = $time.text().trim();
        const bookingUrl = $time.attr("href") || "";

        // Try to parse datetime
        const datetime = this.parseShowtime(timeText, $film.text());
        if (!datetime) return;

        const sourceId = `everyman-${venue.id}-${title.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`;

        screenings.push({
          filmTitle: title,
          datetime,
          bookingUrl: bookingUrl.startsWith("http")
            ? bookingUrl
            : `${this.chainConfig.baseUrl}${bookingUrl}`,
          sourceId,
        });
      });
    });

    return this.validate(screenings);
  }

  private parseShowtime(timeText: string, contextText: string): Date | null {
    // Try to extract time like "14:30" or "2:30pm"
    const timeMatch = timeText.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!timeMatch) return null;

    // Look for date in context
    const dateMatch = contextText.match(
      /(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)/i
    ) || contextText.match(
      /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})/i
    );

    if (!dateMatch) {
      // Assume today if no date found
      const now = new Date();
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const ampm = timeMatch[3]?.toLowerCase();

      if (ampm === "pm" && hours < 12) hours += 12;
      if (ampm === "am" && hours === 12) hours = 0;

      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    }

    // Parse full date
    const months: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3,
      may: 4, june: 5, july: 6, august: 7,
      september: 8, october: 9, november: 10, december: 11,
    };

    let day: number;
    let month: number;

    if (dateMatch[2] && months[dateMatch[2].toLowerCase()] !== undefined) {
      day = parseInt(dateMatch[1]);
      month = months[dateMatch[2].toLowerCase()];
    } else {
      return null;
    }

    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const ampm = timeMatch[3]?.toLowerCase();

    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;

    const year = new Date().getFullYear();
    const date = new Date(year, month, day, hours, minutes);

    // If date is in past, assume next year
    if (date < new Date()) {
      date.setFullYear(year + 1);
    }

    return date;
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
      const response = await fetch(this.chainConfig.baseUrl, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Factory function
export function createEverymanScraper(): EverymanScraper {
  return new EverymanScraper();
}

// Get active venues
export function getActiveEverymanVenues(): VenueConfig[] {
  return EVERYMAN_VENUES.filter(v => v.active !== false);
}
