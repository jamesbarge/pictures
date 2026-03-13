/**
 * Romford Lumiere Scraper
 *
 * Uses Playwright to scrape the CineSync-powered Lumiere Romford website.
 * The site is built with Next.js and loads film/screening data dynamically
 * via the CineSync API.
 *
 * Website: https://www.lumiereromford.com
 * API: https://lumiereromford.api.cinesync.io
 *
 * Strategy:
 * 1. Use Playwright to load the "What's On" page
 * 2. Wait for dynamic content to render
 * 3. Navigate to each film to extract screening times
 * 4. Build RawScreening objects from the extracted data
 */

import * as cheerio from "cheerio";
import { BOT_USER_AGENT } from "../constants";
import type { RawScreening, ScraperConfig } from "../types";
import { getBrowser, closeBrowser, createPage } from "../utils/browser";
import type { Page } from "playwright";
import { addDays, format } from "date-fns";
import { combineDateAndTime } from "../utils/date-parser";
import { slugify } from "../utils/url";


export class RomfordLumiereScraper {
  private page: Page | null = null;

  config: ScraperConfig = {
    cinemaId: "romford-lumiere",
    baseUrl: "https://www.lumiereromford.com",
    requestsPerMinute: 10,
    delayBetweenRequests: 2000,
  };

  async scrape(): Promise<RawScreening[]> {
    console.log(`[${this.config.cinemaId}] Starting scrape with Playwright...`);

    try {
      await this.initialize();
      const screenings = await this.fetchAllScreenings();
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
    console.log(`[${this.config.cinemaId}] Launching browser...`);
    await getBrowser();
    this.page = await createPage();

    // Visit homepage to establish session
    console.log(`[${this.config.cinemaId}] Warming up session...`);
    await this.page.goto(this.config.baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await this.page.waitForTimeout(3000);
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

  private async fetchAllScreenings(): Promise<RawScreening[]> {
    if (!this.page) throw new Error("Browser not initialized");

    const allScreenings: RawScreening[] = [];

    try {
      // Navigate to the buy-tickets page which shows films by date
      console.log(`[${this.config.cinemaId}] Loading buy-tickets page...`);
      await this.page.goto(`${this.config.baseUrl}/en/buy-tickets`, {
        waitUntil: "networkidle",
        timeout: 60000,
      });

      await this.page.waitForTimeout(5000);

      // Try to find and click on dates to load screenings
      // CineSync sites typically have a date picker or calendar view
      const today = new Date();
      const endOfApril = new Date(Date.UTC(2026, 3, 30)); // April 30, 2026

      // Calculate days to scrape (until end of April)
      const daysToScrape: Date[] = [];
      let currentDate = today;
      while (currentDate <= endOfApril) {
        daysToScrape.push(new Date(currentDate));
        currentDate = addDays(currentDate, 1);
      }

      console.log(`[${this.config.cinemaId}] Will scrape ${daysToScrape.length} days until end of April`);

      // Primary method: Extract screenings directly from the buy-tickets page
      // This works better than navigating to individual film pages
      console.log(`[${this.config.cinemaId}] Extracting screenings directly from buy-tickets page...`);

      // Return to buy-tickets page if we navigated away
      if (!this.page.url().includes('buy-tickets')) {
        await this.page.goto(`${this.config.baseUrl}/en/buy-tickets`, {
          waitUntil: "networkidle",
          timeout: 60000,
        });
        await this.page.waitForTimeout(3000);
      }

      const directScreenings = await this.extractScreeningsDirectly();
      allScreenings.push(...directScreenings);

      console.log(`[${this.config.cinemaId}] Direct extraction found ${directScreenings.length} screenings`)

    } catch (error) {
      console.error(`[${this.config.cinemaId}] Error fetching screenings:`, error);
    }

    return allScreenings;
  }

  private async extractScreeningsDirectly(): Promise<RawScreening[]> {
    if (!this.page) return [];

    const screenings: RawScreening[] = [];
    const now = new Date();
    const endOfApril = new Date(Date.UTC(2026, 3, 30));

    try {
      const html = await this.page.content();
      const $ = cheerio.load(html);

      console.log(`[${this.config.cinemaId}] Direct extraction using CineSync selectors...`);

      // CineSync structure: .pc-moviewrap contains film cards
      // Each card has .pc-movie-detail-wrap for title and .pc-movie-time-wrap for times
      // Dates are in .moviedateswrap

      // First, try to find date sections and iterate through them
      const dateWrappers = $('.moviedateswrap');
      console.log(`[${this.config.cinemaId}] Found ${dateWrappers.length} date wrappers`);

      if (dateWrappers.length > 0) {
        dateWrappers.each((_, dateWrapper) => {
          const $dateWrapper = $(dateWrapper);
          // Find date text - usually in a heading or specific date element
          const dateText = $dateWrapper.find('h3, h4, [class*="date-header"], .date').first().text().trim()
            || $dateWrapper.text().match(/\d{1,2}\s+\w+|\w+day\s+\d{1,2}/i)?.[0]
            || '';

          if (!dateText) return;

          // Find all movie cards within or after this date section
          const movieCards = $dateWrapper.find('.pc-moviewrap').length > 0
            ? $dateWrapper.find('.pc-moviewrap')
            : $dateWrapper.nextUntil('.moviedateswrap').find('.pc-moviewrap');

          movieCards.each((_, card) => {
            const $card = $(card);
            const title = $card.find('.pc-movie-detail-wrap h3, .pc-movie-detail-wrap h4, h3, h4').first().text().trim();
            if (!title || title.length < 2) return;

            // Find times in .pc-movie-time-wrap
            $card.find('.pc-movie-time-wrap button, .pc-movie-time-wrap a, [class*="time"] button').each((_, timeEl) => {
              const timeText = $(timeEl).text().trim();
              if (/^\d{1,2}[:.]\d{2}\s*(?:am|pm)?$/i.test(timeText)) {
                const datetime = this.parseShowtimeDateTime(dateText, timeText);
                if (datetime && datetime > now && datetime <= endOfApril) {
                  const sourceId = `romford-lumiere-${slugify(title)}-${datetime.toISOString()}`;
                  screenings.push({
                    filmTitle: this.cleanTitle(title),
                    datetime,
                    bookingUrl: `${this.config.baseUrl}/en/buy-tickets`,
                    sourceId,
                  });
                }
              }
            });
          });
        });
      }

      // Fallback: Look for any visible film/time combinations with CineSync classes
      if (screenings.length === 0) {
        console.log(`[${this.config.cinemaId}] Trying fallback with general movie selectors...`);

        $('.pc-moviewrap, [class*="movie"]').each((_, el) => {
          const $el = $(el);
          const titleEl = $el.find('.pc-movie-detail-wrap h3, .pc-movie-detail-wrap h4, [class*="title"], h2, h3, h4').first();
          const title = titleEl.text().trim();

          if (!title || title.length < 2) return;

          // Look for times within this film card
          $el.find('.pc-movie-time-wrap button, .pc-movie-time-wrap a, [class*="time"], button, a').each((_, timeEl) => {
            const timeText = $(timeEl).text().trim();
            if (/^\d{1,2}[:.]\d{2}\s*(?:am|pm)?$/i.test(timeText)) {
              // Found a time - try to determine the date
              const dateEl = $el.closest('.moviedateswrap').find('[class*="date"]').first();
              const dateText = dateEl.text().trim() || format(now, "yyyy-MM-dd");

            const datetime = this.parseShowtimeDateTime(dateText, timeText);

            if (datetime && datetime > now && datetime <= endOfApril) {
              const sourceId = `romford-lumiere-${slugify(title)}-${datetime.toISOString()}`;

              screenings.push({
                filmTitle: this.cleanTitle(title),
                datetime,
                bookingUrl: `${this.config.baseUrl}/en/buy-tickets`,
                sourceId,
              });
            }
          }
        });
      });
      }

    } catch (error) {
      console.warn(`[${this.config.cinemaId}] Error in direct extraction:`, error);
    }

    return screenings;
  }

  private parseShowtimeDateTime(dateText: string, timeText: string): Date | null {
    const now = new Date();

    try {
      // Clean up the inputs
      dateText = dateText.toLowerCase().trim();
      timeText = timeText.toLowerCase().trim();

      // Parse the time first
      let hours = 0;
      let minutes = 0;

      // Try various time formats
      const time24Match = timeText.match(/^(\d{1,2})[:.:](\d{2})$/);
      const time12Match = timeText.match(/^(\d{1,2})[:.:](\d{2})\s*(am|pm)?$/i);

      if (time24Match) {
        hours = parseInt(time24Match[1]);
        minutes = parseInt(time24Match[2]);
        // If hours are 1-9 and no am/pm, assume PM (per scraping rules)
        if (hours >= 1 && hours <= 9) {
          hours += 12;
        }
      } else if (time12Match) {
        hours = parseInt(time12Match[1]);
        minutes = parseInt(time12Match[2]);
        const period = time12Match[3]?.toLowerCase();

        if (period === "pm" && hours !== 12) {
          hours += 12;
        } else if (period === "am" && hours === 12) {
          hours = 0;
        } else if (!period && hours >= 1 && hours <= 9) {
          // No AM/PM indicator and hour is 1-9, assume PM
          hours += 12;
        }
      } else {
        return null;
      }

      // Validate time
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return null;
      }

      // Warn about early times (likely parsing errors)
      if (hours < 10) {
        console.warn(`[${this.config.cinemaId}] Unusual early time: ${hours}:${minutes.toString().padStart(2, "0")}`);
      }

      // Parse the date
      let targetDate: Date;

      // Try ISO format (2026-01-20)
      const isoMatch = dateText.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        targetDate = new Date(Date.UTC(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3])));
      } else {
        // Try UK format (20/01/2026 or 20-01-2026)
        const ukMatch = dateText.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
        if (ukMatch) {
          const day = parseInt(ukMatch[1]);
          const month = parseInt(ukMatch[2]) - 1;
          let year = parseInt(ukMatch[3]);
          if (year < 100) year += 2000;
          targetDate = new Date(Date.UTC(year, month, day));
        } else {
          // Try text format (Monday 20 January, 20 Jan, Jan 20, etc.)
          const monthNames: Record<string, number> = {
            jan: 0, january: 0,
            feb: 1, february: 1,
            mar: 2, march: 2,
            apr: 3, april: 3,
            may: 4,
            jun: 5, june: 5,
            jul: 6, july: 6,
            aug: 7, august: 7,
            sep: 8, september: 8,
            oct: 9, october: 9,
            nov: 10, november: 10,
            dec: 11, december: 11,
          };

          let foundMonth: number | null = null;
          let foundDay: number | null = null;

          for (const [name, month] of Object.entries(monthNames)) {
            if (dateText.includes(name)) {
              foundMonth = month;
              break;
            }
          }

          const dayMatch = dateText.match(/\b(\d{1,2})\b/);
          if (dayMatch) {
            foundDay = parseInt(dayMatch[1]);
          }

          if (foundMonth !== null && foundDay !== null) {
            // Assume current or next year
            const year = now.getFullYear();
            targetDate = new Date(Date.UTC(year, foundMonth, foundDay));

            // If the date is in the past, try next year
            if (targetDate < now) {
              targetDate = new Date(Date.UTC(year + 1, foundMonth, foundDay));
            }
          } else {
            // Can't parse the date, use today
            targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          }
        }
      }

      // Set the time using BST-aware function
      return combineDateAndTime(targetDate, { hours, minutes });
    } catch {
      return null;
    }
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/\s*\+\s*(Q\s*&?\s*A|intro|discussion|panel).*$/i, "")
      .replace(/^(Preview|UK Premiere|Premiere)[:\s]+/i, "")
      .replace(/\s*\(.*?\)\s*$/, "")
      .replace(/\s+/g, " ")
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
      const response = await fetch(this.config.baseUrl, {
        method: "HEAD",
        headers: {
          "User-Agent": BOT_USER_AGENT,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function createRomfordLumiereScraper(): RomfordLumiereScraper {
  return new RomfordLumiereScraper();
}
