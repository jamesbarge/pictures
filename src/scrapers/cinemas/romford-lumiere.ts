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
import type { RawScreening, ScraperConfig } from "../types";
import type { CheerioAPI } from "../utils/cheerio-types";
import { getBrowser, closeBrowser, createPage } from "../utils/browser";
import type { Page } from "playwright";
import { addDays, parse, format } from "date-fns";

interface CineSyncMovieData {
  movie_id: string;
  movie_name: string;
  url_key: string;
  portrait_image?: string;
  landscape_image?: string;
  runtime?: number;
  release_date?: string;
  director?: string;
}

interface CineSyncShowtime {
  session_id: string;
  session_datetime: string; // ISO datetime
  screen_name?: string;
  format?: string;
  booking_url?: string;
}

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
      const endOfApril = new Date(2026, 3, 30); // April 30, 2026

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

  private async extractFilmsFromPage(): Promise<CineSyncMovieData[]> {
    if (!this.page) return [];

    const films: CineSyncMovieData[] = [];

    try {
      // Wait for CineSync movie cards to load
      await this.page.waitForSelector('.pc-moviewrap, .pc-movies-container, a[href*="/movies/"]', { timeout: 15000 }).catch(() => {});
      await this.page.waitForTimeout(2000); // Extra wait for dynamic content

      // Get the page content and parse with Cheerio
      const html = await this.page.content();
      const $ = cheerio.load(html);

      const seenFilms = new Set<string>();

      // Primary method: Extract from movie page links
      // Links like /en/movies/28-years-later-the-bone-temple-2026?location=romford
      $('a[href*="/movies/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();

        // Skip time/showtime links and "More Performances" links
        if (text.match(/^\d{1,2}:\d{2}/) || text === 'More Performances') return;

        // Extract movie slug from URL
        const slugMatch = href.match(/\/movies\/([^/?]+)/);
        if (slugMatch) {
          const urlKey = slugMatch[1];
          // Convert slug to title (replace hyphens with spaces, title case)
          let movieName = urlKey
            .replace(/-\d{4}$/, '') // Remove year suffix like -2026
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());

          // If we have link text that's not a time, prefer that
          if (text && text.length > 2 && !text.match(/^\d/) && text !== 'More Performances') {
            movieName = text;
          }

          if (movieName && movieName.length > 1 && !seenFilms.has(urlKey)) {
            seenFilms.add(urlKey);
            films.push({
              movie_id: urlKey,
              movie_name: movieName,
              url_key: urlKey,
            });
          }
        }
      });

      // Fallback: Try title elements within movie cards
      if (films.length === 0) {
        const movieCardSelectors = ['.pc-moviewrap', '.pc-movie-content'];

        for (const selector of movieCardSelectors) {
          const movieCards = $(selector);
          if (movieCards.length === 0) continue;

          console.log(`[${this.config.cinemaId}] Found ${movieCards.length} cards with selector: ${selector}`);

          movieCards.each((_, el) => {
            const $card = $(el);

            // Look for title in elements with class containing "title"
            let movieName = '';
            const titleEl = $card.find('[class*="title"]').first();
            if (titleEl.length > 0) {
              movieName = titleEl.text().trim();
            }

            // Fallback: try link href
            if (!movieName || movieName.length < 2) {
              const link = $card.find('a[href*="/movies/"]').first();
              const href = link.attr('href') || '';
              const slugMatch = href.match(/\/movies\/([^/?]+)/);
              if (slugMatch) {
                movieName = slugMatch[1].replace(/-\d{4}$/, '').replace(/-/g, ' ')
                  .replace(/\b\w/g, c => c.toUpperCase());
              }
            }

            movieName = movieName.replace(/\s+/g, ' ').trim();

            if (movieName && movieName.length > 1 && !seenFilms.has(movieName.toLowerCase())) {
              seenFilms.add(movieName.toLowerCase());
              const urlKey = movieName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              films.push({
                movie_id: urlKey,
                movie_name: movieName,
                url_key: urlKey,
              });
            }
          });

          if (films.length > 0) break;
        }
      }

      console.log(`[${this.config.cinemaId}] Extracted ${films.length} films from page`);
    } catch (error) {
      console.warn(`[${this.config.cinemaId}] Error extracting films:`, error);
    }

    return films;
  }

  private async extractFilmScreenings(
    film: CineSyncMovieData,
    endDate: Date
  ): Promise<RawScreening[]> {
    if (!this.page) return [];

    const screenings: RawScreening[] = [];

    try {
      // Navigate to the film's page
      const filmUrl = `${this.config.baseUrl}/en/movies/${film.url_key}`;
      console.log(`[${this.config.cinemaId}] Fetching screenings for "${film.movie_name}"...`);

      await this.page.goto(filmUrl, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      await this.page.waitForTimeout(3000);

      // Get page content
      const html = await this.page.content();
      const $ = cheerio.load(html);

      // CineSync sites typically show showtimes in buttons or links with session info
      // Look for session/showtime elements

      // Try various selectors that CineSync sites commonly use
      const sessionSelectors = [
        'button[data-session-id]',
        'a[href*="session"]',
        '[class*="showtime"]',
        '[class*="session"]',
        'button[class*="time"]',
        'a[class*="time"]',
      ];

      let foundSessions = false;

      for (const selector of sessionSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          foundSessions = true;

          elements.each((_, el) => {
            const $el = $(el);

            // Try to extract datetime from the element or its data attributes
            const sessionId = $el.attr("data-session-id") || $el.attr("data-id") || "";
            const timeText = $el.text().trim();

            // Look for date in parent/sibling elements
            const $parent = $el.closest('[data-date], [class*="date"]');
            const dateText = $parent.attr("data-date") || $parent.text().match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}-\d{2}-\d{2}/)?.[0] || "";

            // Try to parse the datetime
            const datetime = this.parseShowtimeDateTime(dateText, timeText);

            if (datetime && datetime <= endDate && datetime > new Date()) {
              // Build booking URL
              let bookingUrl = $el.attr("href") || "";
              if (!bookingUrl || !bookingUrl.startsWith("http")) {
                bookingUrl = `${this.config.baseUrl}/en/movies/${film.url_key}?showtime=${sessionId}`;
              }

              const sourceId = `romford-lumiere-${sessionId || this.slugify(film.movie_name)}-${datetime.toISOString()}`;

              screenings.push({
                filmTitle: this.cleanTitle(film.movie_name),
                datetime,
                bookingUrl,
                sourceId,
                year: film.release_date ? this.extractYear(film.release_date) : undefined,
                director: film.director,
              });
            }
          });

          break;
        }
      }

      // If no sessions found via selectors, try parsing from the page text
      if (!foundSessions) {
        const pageScreenings = await this.parseScreeningsFromPageText($, film, endDate);
        screenings.push(...pageScreenings);
      }

      console.log(`[${this.config.cinemaId}] Found ${screenings.length} screenings for "${film.movie_name}"`);
    } catch (error) {
      console.warn(`[${this.config.cinemaId}] Error fetching film screenings:`, error);
    }

    return screenings;
  }

  private async parseScreeningsFromPageText(
    $: CheerioAPI,
    film: CineSyncMovieData,
    endDate: Date
  ): Promise<RawScreening[]> {
    const screenings: RawScreening[] = [];
    const now = new Date();

    // Look for date headings and time buttons
    // Common patterns in cinema sites: date headers followed by time buttons
    const dateBlocks = $('[class*="date"], [class*="day"], h3, h4').filter((_, el) => {
      const text = $(el).text();
      // Check if this looks like a date
      return /\d{1,2}|\w+day|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(text);
    });

    dateBlocks.each((_, dateEl) => {
      const dateText = $(dateEl).text().trim();

      // Find times near this date
      const $container = $(dateEl).parent();
      const timeElements = $container.find('button, a').filter((_, el) => {
        const text = $(el).text().trim();
        // Check if this looks like a time (e.g., "14:30", "2:30pm", "2:30 PM")
        return /^\d{1,2}[:.]\d{2}\s*(?:am|pm)?$/i.test(text);
      });

      timeElements.each((_, timeEl) => {
        const timeText = $(timeEl).text().trim();
        const datetime = this.parseShowtimeDateTime(dateText, timeText);

        if (datetime && datetime > now && datetime <= endDate) {
          const sourceId = `romford-lumiere-${this.slugify(film.movie_name)}-${datetime.toISOString()}`;

          screenings.push({
            filmTitle: this.cleanTitle(film.movie_name),
            datetime,
            bookingUrl: `${this.config.baseUrl}/en/movies/${film.url_key}`,
            sourceId,
          });
        }
      });
    });

    return screenings;
  }

  private async extractScreeningsDirectly(): Promise<RawScreening[]> {
    if (!this.page) return [];

    const screenings: RawScreening[] = [];
    const now = new Date();
    const endOfApril = new Date(2026, 3, 30);

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
                  const sourceId = `romford-lumiere-${this.slugify(title)}-${datetime.toISOString()}`;
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
              const sourceId = `romford-lumiere-${this.slugify(title)}-${datetime.toISOString()}`;

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
        targetDate = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
      } else {
        // Try UK format (20/01/2026 or 20-01-2026)
        const ukMatch = dateText.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
        if (ukMatch) {
          const day = parseInt(ukMatch[1]);
          const month = parseInt(ukMatch[2]) - 1;
          let year = parseInt(ukMatch[3]);
          if (year < 100) year += 2000;
          targetDate = new Date(year, month, day);
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
            targetDate = new Date(year, foundMonth, foundDay);

            // If the date is in the past, try next year
            if (targetDate < now) {
              targetDate = new Date(year + 1, foundMonth, foundDay);
            }
          } else {
            // Can't parse the date, use today
            targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          }
        }
      }

      // Set the time
      targetDate.setHours(hours, minutes, 0, 0);

      return targetDate;
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

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 50);
  }

  private extractYear(dateStr: string): number | undefined {
    const match = dateStr.match(/\b(19|20)\d{2}\b/);
    return match ? parseInt(match[0]) : undefined;
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
          "User-Agent": "Mozilla/5.0 (compatible; PicturesBot/1.0)",
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
