/**
 * ODEON Cinemas Scraper
 *
 * Uses Playwright to scrape showtime data from ODEON cinema pages.
 * ODEON's Vista API requires complex authentication, so we scrape the
 * rendered DOM which contains all the showtime information.
 *
 * Website: https://www.odeon.co.uk
 *
 * Data structure discovered:
 * - OMNIA API for cinema list: /api/omnia/v1/pageList?friendly=/cinemas/
 * - Each cinema has a vistaCinema.key (site ID)
 * - Showtimes are rendered in the DOM with booking links containing showtimeId
 *
 * To add a new ODEON venue:
 * 1. Add venue config to ODEON_VENUES array below
 * 2. Find the venue's Vista siteId from the OMNIA API or URL
 */

import type { ChainConfig, VenueConfig, RawScreening, ChainScraper } from "../types";
import { getBrowser, closeBrowser, createPage } from "../utils/browser";
import type { Page } from "playwright";
import { parse, addDays, format } from "date-fns";

// ============================================================================
// ODEON London Venue Configurations
// chainVenueId is the Vista API site code (e.g., "153" for Leicester Square)
// ============================================================================

export const ODEON_VENUES: VenueConfig[] = [
  {
    id: "odeon-leicester-square",
    name: "ODEON Luxe Leicester Square",
    shortName: "ODEON Leicester Sq",
    slug: "london-leicester-square",
    area: "Leicester Square",
    postcode: "WC2H 7JY",
    address: "24-26 Leicester Square",
    chainVenueId: "153",
    features: ["luxe", "dolby_cinema", "dolby_atmos"],
    active: true,
  },
  {
    id: "odeon-west-end",
    name: "ODEON Luxe London West End",
    shortName: "ODEON West End",
    slug: "london-west-end",
    area: "Leicester Square",
    postcode: "WC2H 7DX",
    address: "38 Leicester Square",
    chainVenueId: "155",
    features: ["luxe", "imax"],
    active: true,
  },
  {
    id: "odeon-tottenham-court-road",
    name: "ODEON Luxe Tottenham Court Road",
    shortName: "ODEON TCR",
    slug: "london-tottenham-court-road",
    area: "Fitzrovia",
    postcode: "W1T 1BX",
    address: "30 Tottenham Court Road",
    chainVenueId: "200",
    features: ["luxe"],
    active: true,
  },
  {
    id: "odeon-haymarket",
    name: "ODEON Luxe London Haymarket",
    shortName: "ODEON Haymarket",
    slug: "london-haymarket",
    area: "Haymarket",
    postcode: "SW1Y 4DP",
    address: "11-18 Panton Street",
    chainVenueId: "158",
    features: ["luxe"],
    active: true,
  },
  {
    id: "odeon-covent-garden",
    name: "ODEON Luxe London Covent Garden",
    shortName: "ODEON Covent Gdn",
    slug: "london-covent-garden",
    area: "Covent Garden",
    postcode: "WC2E 9DD",
    address: "135 Shaftesbury Avenue",
    chainVenueId: "240",
    features: ["luxe"],
    active: true,
  },
  {
    id: "odeon-camden",
    name: "ODEON Camden",
    shortName: "ODEON Camden",
    slug: "camden",
    area: "Camden",
    postcode: "NW1 7AA",
    address: "14 The Parkway",
    chainVenueId: "590",
    active: true,
  },
  {
    id: "odeon-islington",
    name: "ODEON Luxe Islington",
    shortName: "ODEON Islington",
    slug: "islington",
    area: "Islington",
    postcode: "N1 1TU",
    address: "13 Esther Anne Place",
    chainVenueId: "858",
    features: ["luxe"],
    active: true,
  },
  {
    id: "odeon-holloway",
    name: "ODEON Holloway",
    shortName: "ODEON Holloway",
    slug: "holloway",
    area: "Holloway",
    postcode: "N7 6LJ",
    address: "419-427 Holloway Road",
    chainVenueId: "125",
    active: true,
  },
  {
    id: "odeon-swiss-cottage",
    name: "ODEON Swiss Cottage",
    shortName: "ODEON Swiss Cottage",
    slug: "swiss-cottage",
    area: "Swiss Cottage",
    postcode: "NW3 5EL",
    address: "96 Finchley Road",
    chainVenueId: "838",
    active: true,
  },
  {
    id: "odeon-lee-valley",
    name: "ODEON Lee Valley",
    shortName: "ODEON Lee Valley",
    slug: "lee-valley",
    area: "Edmonton",
    postcode: "N9 0AS",
    address: "Picketts Lock Lane",
    chainVenueId: "949",
    active: true,
  },
  {
    id: "odeon-greenwich",
    name: "ODEON Luxe Greenwich",
    shortName: "ODEON Greenwich",
    slug: "greenwich",
    area: "Greenwich",
    postcode: "SE10 0QJ",
    address: "Bugsby Way",
    chainVenueId: "963",
    features: ["luxe"],
    active: true,
  },
  {
    id: "odeon-streatham",
    name: "ODEON Streatham",
    shortName: "ODEON Streatham",
    slug: "streatham",
    area: "Streatham",
    postcode: "SW16 1PW",
    address: "47-49 High Road",
    chainVenueId: "694",
    active: true,
  },
  {
    id: "odeon-wimbledon",
    name: "ODEON Wimbledon",
    shortName: "ODEON Wimbledon",
    slug: "wimbledon",
    area: "Wimbledon",
    postcode: "SW19 1QB",
    address: "39 The Broadway",
    chainVenueId: "555",
    active: true,
  },
  {
    id: "odeon-putney",
    name: "ODEON Putney",
    shortName: "ODEON Putney",
    slug: "putney",
    area: "Putney",
    postcode: "SW15 1SN",
    address: "26 Putney High Street",
    chainVenueId: "486",
    active: true,
  },
  {
    id: "odeon-richmond",
    name: "ODEON Richmond",
    shortName: "ODEON Richmond",
    slug: "richmond",
    area: "Richmond",
    postcode: "TW9 1TW",
    address: "72 Hill Street",
    chainVenueId: "888",
    active: true,
  },
  {
    id: "odeon-kingston",
    name: "ODEON Kingston",
    shortName: "ODEON Kingston",
    slug: "kingston",
    area: "Kingston",
    postcode: "KT1 1QP",
    address: "Clarence Street",
    chainVenueId: "536",
    active: true,
  },
  {
    id: "odeon-south-woodford",
    name: "ODEON South Woodford",
    shortName: "ODEON S Woodford",
    slug: "south-woodford",
    area: "South Woodford",
    postcode: "E18 2QL",
    address: "60-64 High Road",
    chainVenueId: "090",
    active: true,
  },
  {
    id: "odeon-acton",
    name: "ODEON Acton",
    shortName: "ODEON Acton",
    slug: "acton",
    area: "Acton",
    postcode: "W3 0PA",
    address: "Western Avenue",
    chainVenueId: "995",
    active: true,
  },
  {
    id: "odeon-uxbridge",
    name: "ODEON Uxbridge",
    shortName: "ODEON Uxbridge",
    slug: "uxbridge",
    area: "Uxbridge",
    postcode: "UB8 1GD",
    address: "302 The Chimes Shopping Centre",
    chainVenueId: "593",
    active: true,
  },
  // Outer London / Greater London
  {
    id: "odeon-beckenham",
    name: "ODEON Beckenham",
    shortName: "ODEON Beckenham",
    slug: "beckenham",
    area: "Beckenham",
    postcode: "BR3 1DY",
    address: "The High Street",
    chainVenueId: "695",
    active: true,
  },
  {
    id: "odeon-orpington",
    name: "ODEON Orpington",
    shortName: "ODEON Orpington",
    slug: "orpington",
    area: "Orpington",
    postcode: "BR6 0TW",
    address: "The Walnuts Shopping Centre",
    chainVenueId: "852",
    active: true,
  },
  {
    id: "odeon-epsom",
    name: "ODEON Epsom",
    shortName: "ODEON Epsom",
    slug: "epsom",
    area: "Epsom",
    postcode: "KT17 4QJ",
    address: "14b-18 Upper High Street",
    chainVenueId: "570",
    active: true,
  },
];

// ============================================================================
// Chain Configuration
// ============================================================================

export const ODEON_CONFIG: ChainConfig = {
  chainId: "odeon",
  chainName: "ODEON",
  baseUrl: "https://www.odeon.co.uk",
  venues: ODEON_VENUES,
  requestsPerMinute: 10, // Be gentle, DOM scraping is slower
  delayBetweenRequests: 2000,
};

// ============================================================================
// ODEON Scraper Implementation (Playwright DOM Scraping)
// ============================================================================

interface ScrapedShowtime {
  time: string;
  screen: string | null;
  url: string | null;
  showtimeId: string | null;
}

interface ScrapedFilm {
  title: string;
  link: string | null;
  showtimes: ScrapedShowtime[];
}

export class OdeonScraper implements ChainScraper {
  chainConfig = ODEON_CONFIG;
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
          console.warn(`[odeon] Unknown venue: ${venueId}`);
          continue;
        }

        console.log(`[odeon] Scraping ${venue.name}...`);
        const screenings = await this.scrapeVenueFromDom(venue);
        results.set(venueId, screenings);

        // Delay between venues to be polite
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
      console.error(`[odeon] Venue not found: ${venueId}`);
      return [];
    }

    try {
      await this.initialize();
      return await this.scrapeVenueFromDom(venue);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Scrape venue using DOM extraction
   */
  private async scrapeVenueFromDom(venue: VenueConfig): Promise<RawScreening[]> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    const allScreenings: RawScreening[] = [];
    const url = `${this.chainConfig.baseUrl}/cinemas/${venue.slug}/`;

    try {
      // Navigate to cinema page
      await this.page.goto(url, {
        waitUntil: "networkidle",
        timeout: 60000,
      });

      // Wait for showtimes to load
      await this.page.waitForTimeout(3000);

      // Dismiss cookie banner if present
      try {
        const cookieBtn = this.page.locator('button:has-text("Yes that\'s fine")');
        if (await cookieBtn.isVisible({ timeout: 2000 })) {
          await cookieBtn.click();
          await this.page.waitForTimeout(500);
        }
      } catch {
        // No cookie banner or already dismissed
      }

      // Get available dates from the date picker
      const dates = await this.getAvailableDates();
      console.log(`[odeon] ${venue.name}: ${dates.length} dates available`);

      // Scrape each date (limit to 14 days)
      const datesToScrape = dates.slice(0, 14);

      for (let i = 0; i < datesToScrape.length; i++) {
        const dateInfo = datesToScrape[i];

        // Click on the date button if not already selected
        if (i > 0) {
          try {
            const dateButton = this.page.locator(`button:has-text("${dateInfo.label}")`).first();
            if (await dateButton.isVisible({ timeout: 2000 })) {
              await dateButton.click();
              await this.page.waitForTimeout(2000);
            }
          } catch {
            console.warn(`[odeon] Could not click date: ${dateInfo.label}`);
            continue;
          }
        }

        // Extract showtimes for this date
        const films = await this.extractShowtimesFromPage();
        const screenings = this.convertToRawScreenings(films, venue, dateInfo.date);
        allScreenings.push(...screenings);

        // Small delay between dates
        await new Promise(r => setTimeout(r, 500));
      }

      console.log(`[odeon] ${venue.name}: ${allScreenings.length} screenings total`);
      return this.deduplicate(allScreenings);

    } catch (error) {
      console.error(`[odeon] Error scraping ${venue.name}:`, error);
      return [];
    }
  }

  /**
   * Get available dates from the date picker
   */
  private async getAvailableDates(): Promise<Array<{ label: string; date: Date }>> {
    if (!this.page) return [];

    const dates: Array<{ label: string; date: Date }> = [];

    try {
      // Extract date buttons from the page
      const dateData = await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        const dateButtons: string[] = [];

        buttons.forEach(btn => {
          const text = btn.textContent?.trim() || "";
          // Match patterns like "Today", "Sat 3 Jan", "Sun 4 Jan"
          if (text === "Today" || /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d+\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i.test(text)) {
            dateButtons.push(text);
          }
        });

        return dateButtons;
      });

      const now = new Date();

      for (const label of dateData) {
        if (label === "Today") {
          dates.push({ label, date: now });
        } else {
          // Parse "Sat 3 Jan" format
          const match = label.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d+)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i);
          if (match) {
            const day = parseInt(match[2]);
            const monthStr = match[3];
            const months: Record<string, number> = {
              jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
              jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
            };
            const month = months[monthStr.toLowerCase()];

            // Determine year (handle year boundary)
            let year = now.getFullYear();
            if (month < now.getMonth() - 1) {
              year++; // Date is likely next year
            }

            const date = new Date(year, month, day);
            dates.push({ label, date });
          }
        }
      }
    } catch (error) {
      console.warn("[odeon] Error getting dates:", error);
    }

    return dates;
  }

  /**
   * Extract showtime data from the current page
   */
  private async extractShowtimesFromPage(): Promise<ScrapedFilm[]> {
    if (!this.page) return [];

    return this.page.evaluate(() => {
      const films: Array<{
        title: string;
        link: string | null;
        showtimes: Array<{
          time: string;
          screen: string | null;
          url: string | null;
          showtimeId: string | null;
        }>;
      }> = [];

      const listItems = document.querySelectorAll('li');

      listItems.forEach(li => {
        const heading = li.querySelector('h2');
        const timeElements = li.querySelectorAll('time');
        const links = li.querySelectorAll('a[href*="/films/"]');

        if (heading && timeElements.length > 0) {
          const filmTitle = heading.textContent?.trim() || "";
          const filmLink = links[0]?.getAttribute('href') || null;

          // Get booking links with showtime IDs
          const bookingLinks = Array.from(li.querySelectorAll('a[href*="showtimeId"]')).map(a => ({
            time: a.querySelector('time')?.textContent?.trim() || "",
            screen: a.textContent?.match(/Screen \d+/)?.[0] || null,
            url: a.getAttribute('href'),
            showtimeId: a.getAttribute('href')?.match(/showtimeId=([^&]+)/)?.[1] || null
          }));

          if (filmTitle && bookingLinks.length > 0) {
            films.push({
              title: filmTitle,
              link: filmLink,
              showtimes: bookingLinks
            });
          }
        }
      });

      return films;
    });
  }

  /**
   * Convert scraped data to RawScreenings
   */
  private convertToRawScreenings(
    films: ScrapedFilm[],
    venue: VenueConfig,
    date: Date
  ): RawScreening[] {
    const screenings: RawScreening[] = [];

    for (const film of films) {
      for (const showtime of film.showtimes) {
        if (!showtime.time) continue;

        // Parse time string (e.g., "21:00")
        const [hours, minutes] = showtime.time.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) continue;

        // Create datetime by combining date and time
        const datetime = new Date(date);
        datetime.setHours(hours, minutes, 0, 0);

        // Skip past screenings
        if (datetime < new Date()) continue;

        // Build booking URL
        const bookingUrl = showtime.url
          ? `${this.chainConfig.baseUrl}${showtime.url}`
          : `${this.chainConfig.baseUrl}/cinemas/${venue.slug}/`;

        const sourceId = showtime.showtimeId
          ? `odeon-${showtime.showtimeId}`
          : `odeon-${venue.chainVenueId}-${datetime.getTime()}`;

        screenings.push({
          filmTitle: film.title,
          datetime,
          bookingUrl,
          sourceId,
          screen: showtime.screen || undefined,
        });
      }
    }

    return screenings;
  }

  /**
   * Initialize Playwright browser
   */
  private async initialize(): Promise<void> {
    console.log(`[odeon] Launching browser...`);
    await getBrowser();
    this.page = await createPage();
  }

  /**
   * Cleanup browser resources
   */
  private async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    await closeBrowser();
    console.log(`[odeon] Browser closed`);
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
export function createOdeonScraper(): OdeonScraper {
  return new OdeonScraper();
}

// Get active venues for easy reference
export function getActiveOdeonVenues(): VenueConfig[] {
  return ODEON_VENUES.filter(v => v.active !== false);
}

// Get all London ODEON venues (for adding to database)
export function getLondonOdeonVenues(): VenueConfig[] {
  return ODEON_VENUES;
}
