/**
 * Phoenix Cinema Scraper
 *
 * Cinema: Phoenix Cinema (East Finchley)
 * Address: 52 High Rd, London N2 9PJ
 * Website: https://phoenixcinema.co.uk
 *
 * Uses DOM parsing to extract films and showtimes from the website.
 * Website uses a classic ASP.NET/DLL system with /PhoenixCinemaLondon.dll endpoints.
 */

import { chromium } from "playwright";
import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";
import { parse, getYear, addYears } from "date-fns";

const PHOENIX_CONFIG: ScraperConfig & { programmeUrl: string } = {
  cinemaId: "phoenix",
  baseUrl: "https://www.phoenixcinema.co.uk",
  programmeUrl: "https://www.phoenixcinema.co.uk/whats-on/",
  requestsPerMinute: 10,
  delayBetweenRequests: 1000,
};

interface PhoenixFilm {
  title: string;
  pageUrl: string;
}

export class PhoenixScraper implements CinemaScraper {
  config = PHOENIX_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log(`[${this.config.cinemaId}] Starting Phoenix Cinema scrape...`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // Step 1: Get list of films from the programme page
      console.log(`[${this.config.cinemaId}] Loading programme page...`);
      await page.goto(this.config.programmeUrl, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(3000);

      // Extract films from the page
      const films = await page.evaluate(() => {
        const results: Array<{ title: string; pageUrl: string }> = [];
        const seenUrls = new Set<string>();

        document.querySelectorAll('.film-title, [class*="film-title"]').forEach(el => {
          const title = el.textContent?.trim() || '';
          if (!title || title.length < 2) return;

          // Find the parent link
          const parent = el.closest('a') as HTMLAnchorElement | null;
          let pageUrl = '';

          if (parent && parent.href) {
            pageUrl = parent.href;
          } else {
            // Look for link in parent container
            const container = el.closest('div, article');
            const link = container?.querySelector('a[href*="WhatsOn"]') as HTMLAnchorElement | null;
            if (link) {
              pageUrl = link.href;
            }
          }

          if (pageUrl && !seenUrls.has(pageUrl)) {
            seenUrls.add(pageUrl);
            results.push({ title, pageUrl });
          }
        });

        return results;
      });

      console.log(`[${this.config.cinemaId}] Found ${films.length} films`);

      // Step 2: Visit each film page and extract showtimes
      const allScreenings: RawScreening[] = [];
      const now = new Date();
      const currentYear = getYear(now);

      for (const film of films) {
        try {
          console.log(`[${this.config.cinemaId}] Fetching showtimes for "${film.title}"...`);

          await page.goto(film.pageUrl, { waitUntil: "networkidle", timeout: 30000 });
          await page.waitForTimeout(1500);

          // Extract dates and times from the film page
          const showtimes = await page.evaluate(() => {
            const results: Array<{ date: string; time: string; bookingUrl?: string }> = [];

            // Get all date elements
            const dateElements = document.querySelectorAll('[class*="date"]');
            const dates: string[] = [];
            dateElements.forEach(el => {
              const text = el.textContent?.trim();
              if (text && /Mon|Tue|Wed|Thu|Fri|Sat|Sun/i.test(text)) {
                dates.push(text);
              }
            });

            // Get all time elements with their booking links
            const timeElements = document.querySelectorAll('[class*="time"]');
            const times: Array<{ time: string; bookingUrl?: string }> = [];
            timeElements.forEach(el => {
              const text = el.textContent?.trim();
              if (text && /^\d{1,2}:\d{2}$/.test(text)) {
                const parent = el.closest('a');
                const bookingUrl = parent?.getAttribute('href') || undefined;
                times.push({ time: text, bookingUrl });
              }
            });

            // Match dates to times
            // The pattern seems to be dates followed by their times in groups
            // For now, use a simpler approach: pair unique dates with times sequentially

            // Actually look for date-time groups
            const dateTimeGroups = document.querySelectorAll('[class*="showtime"], [class*="session"], .performance-row, [class*="schedule"]');

            if (dateTimeGroups.length > 0) {
              // Parse structured groups
              dateTimeGroups.forEach(group => {
                const dateEl = group.querySelector('[class*="date"]');
                const timeEl = group.querySelector('[class*="time"]');
                if (dateEl && timeEl) {
                  const date = dateEl.textContent?.trim() || '';
                  const time = timeEl.textContent?.trim() || '';
                  const link = group.querySelector('a');
                  results.push({
                    date,
                    time,
                    bookingUrl: link?.href
                  });
                }
              });
            }

            // If no structured groups, try to correlate dates and times
            if (results.length === 0 && dates.length > 0 && times.length > 0) {
              // Simple heuristic: assume times are distributed across dates
              const timesPerDate = Math.ceil(times.length / dates.length);
              let timeIndex = 0;

              for (const date of dates) {
                for (let i = 0; i < timesPerDate && timeIndex < times.length; i++) {
                  results.push({
                    date,
                    time: times[timeIndex].time,
                    bookingUrl: times[timeIndex].bookingUrl
                  });
                  timeIndex++;
                }
              }
            }

            return results;
          });

          // Convert to RawScreenings
          for (const showtime of showtimes) {
            const datetime = this.parseShowtime(showtime.date, showtime.time, currentYear, now);
            if (datetime && datetime > now) {
              const bookingUrl = showtime.bookingUrl
                ? (showtime.bookingUrl.startsWith('http') ? showtime.bookingUrl : `${this.config.baseUrl}/${showtime.bookingUrl.replace(/^\//, '')}`)
                : film.pageUrl;

              allScreenings.push({
                filmTitle: film.title,
                datetime,
                bookingUrl,
                sourceId: `phoenix-${film.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${datetime.toISOString()}`,
              });
            }
          }

          // Delay between film pages
          await page.waitForTimeout(this.config.delayBetweenRequests);
        } catch (error) {
          console.warn(`[${this.config.cinemaId}] Error fetching showtimes for "${film.title}":`, error);
        }
      }

      // Deduplicate
      const seen = new Set<string>();
      const uniqueScreenings = allScreenings.filter(s => {
        const key = `${s.filmTitle}-${s.datetime.toISOString()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log(`[${this.config.cinemaId}] Found ${uniqueScreenings.length} screenings total`);
      return uniqueScreenings;
    } finally {
      await browser.close();
    }
  }

  private parseShowtime(dateStr: string, timeStr: string, currentYear: number, now: Date): Date | null {
    try {
      // Parse date like "Tue 3 Feb" or "Wed 4 Feb"
      const dateMatch = dateStr.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
      if (!dateMatch) return null;

      const day = parseInt(dateMatch[1], 10);
      const monthStr = dateMatch[2];

      // Parse time like "17:00" or "14:15"
      const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
      if (!timeMatch) return null;

      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);

      // Build date string and parse
      const dateFullStr = `${day} ${monthStr} ${currentYear}`;
      let datetime = parse(dateFullStr, "d MMM yyyy", new Date());

      // Set time
      datetime.setHours(hours, minutes, 0, 0);

      // Only roll to next year if date is more than 30 days in the past
      // (handles year boundary cases like Dec->Jan, but not recent past dates)
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      if (datetime < thirtyDaysAgo) {
        datetime = parse(`${day} ${monthStr} ${currentYear + 1}`, "d MMM yyyy", new Date());
        datetime.setHours(hours, minutes, 0, 0);
      }

      return datetime;
    } catch {
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
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

export function createPhoenixScraper(): PhoenixScraper {
  return new PhoenixScraper();
}
