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

import { getYear } from "date-fns";
import { chromium } from "rebrowser-playwright";

import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";
import { BOT_USER_AGENT } from "../constants";
import {
  combineDateAndTime,
  parseScreeningDate,
} from "../utils/date-parser";

const PHOENIX_CONFIG: ScraperConfig & { programmeUrl: string } = {
  cinemaId: "phoenix-east-finchley",
  baseUrl: "https://www.phoenixcinema.co.uk",
  programmeUrl: "https://www.phoenixcinema.co.uk/whats-on/",
  requestsPerMinute: 10,
  delayBetweenRequests: 1000,
};

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
      // NOTE: This is a server-rendered ASP.NET/DLL site (all films + times are in
      // the initial HTML). Do NOT use waitUntil: "networkidle" — the site keeps
      // analytics/tracking connections open so networkidle never fires and goto
      // times out after 60s (this was the cause of the 2026-07-18 outage).
      // /whats-on/ 301-redirects to /PhoenixCinemaLondon.dll/Home; Playwright
      // follows the redirect automatically.
      await page.goto(this.config.programmeUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
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
      const failedFilms: string[] = [];
      const now = new Date();
      const currentYear = getYear(now);

      for (const film of films) {
        try {
          console.log(`[${this.config.cinemaId}] Fetching showtimes for "${film.title}"...`);

          await page.goto(film.pageUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
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

            // Look for date-time groups. The live site renders one
            // <li class="performance columns is-multiline"> per DATE — not per
            // screening — and a date with two showings puts both inside it:
            //   <span class="date column is-12">Sat 29 Aug</span>
            //   <div class="column">
            //     <span class="perf-time">17:30</span>
            //     <a class="button booking" href="Booking?...TcsPerformance_604101...">
            //     <span class="perf-time">20:00</span>
            //     <a class="button booking" href="Booking?...TcsPerformance_604099...">
            //   </div>
            // `.performance` matches only those <li> rows (not
            // `.programme-performances` / `.performances`, whose class tokens
            // differ, nor the `day-has-performance` calendar cells).
            const dateTimeGroups = document.querySelectorAll('.performance, [class*="showtime"], [class*="session"], .performance-row, [class*="schedule"]');

            if (dateTimeGroups.length > 0) {
              // Parse structured groups
              dateTimeGroups.forEach(group => {
                const dateEl = group.querySelector('[class*="date"]');
                if (!dateEl) return;
                const date = dateEl.textContent?.trim() || '';

                // Walk EVERY .perf-time in the row, not just the first. Each one
                // is followed by its own booking <a>, so pair a time with the
                // next anchor sibling. Using querySelector('.perf-time') here
                // (as this did until 2026-08-09) kept only the first showing of
                // each day and silently dropped 10 of Phoenix's 66 published
                // screenings — every second-and-later showtime on a busy date.
                const timeEls = group.querySelectorAll('.perf-time');
                if (timeEls.length > 0) {
                  timeEls.forEach(timeEl => {
                    // Stop at the next .perf-time as well as at the anchor. A
                    // sold-out showing renders a "Sold out" span instead of its
                    // own booking <a>, so an unbounded walk would run past the
                    // following .perf-time and attach THAT showtime's ticket URL
                    // to this one — sending the user to the wrong performance.
                    // Better to store no bookingUrl than a confidently wrong one.
                    let node: Element | null = timeEl.nextElementSibling;
                    while (node && node.tagName !== 'A') {
                      if (node.classList.contains('perf-time')) {
                        node = null;
                        break;
                      }
                      node = node.nextElementSibling;
                    }
                    results.push({
                      date,
                      time: timeEl.textContent?.trim() || '',
                      // .href is the resolved absolute URL (includes /PhoenixCinemaLondon.dll/).
                      bookingUrl: node ? (node as HTMLAnchorElement).href : undefined
                    });
                  });
                  return;
                }

                // Fallback for the looser selectors above, which may use a
                // different time class. Never matches the booking button's own
                // .time span on this site, because that path needs .perf-time
                // to be absent.
                const timeEl = group.querySelector('[class*="time"]');
                if (timeEl) {
                  const link = group.querySelector('a');
                  results.push({
                    date,
                    time: timeEl.textContent?.trim() || '',
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
            const screening = this.toRawScreening(showtime, film.title, film.pageUrl, currentYear, now);
            if (screening) allScreenings.push(screening);
          }

          // Delay between film pages
          await page.waitForTimeout(this.config.delayBetweenRequests);
        } catch (error) {
          console.warn(`[${this.config.cinemaId}] Error fetching showtimes for "${film.title}":`, error);
          failedFilms.push(film.title);
        }
      }

      if (failedFilms.length > 0) {
        throw new Error(`Failed to fetch ${failedFilms.length}/${films.length} Phoenix film pages`);
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


  /** Convert a parsed showtime into a RawScreening, or null if the screening is in the past. */
  private toRawScreening(
    showtime: { date: string; time: string; bookingUrl?: string },
    filmTitle: string,
    filmPageUrl: string,
    currentYear: number,
    now: Date,
  ): RawScreening | null {
    const datetime = this.parseShowtime(showtime.date, showtime.time, currentYear, now);
    if (!datetime || datetime <= now) return null;

    const bookingUrl = showtime.bookingUrl
      ? (showtime.bookingUrl.startsWith('http') ? showtime.bookingUrl : `${this.config.baseUrl}/${showtime.bookingUrl.replace(/^\//, '')}`)
      : filmPageUrl;

    return {
      filmTitle,
      datetime,
      bookingUrl,
      sourceId: `phoenix-${filmTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${datetime.toISOString()}`,
    };
  }

  private parseShowtime(dateStr: string, timeStr: string, currentYear: number, now: Date): Date | null {
    try {
      // Parse date like "Tue 3 Feb" or "Wed 4 Feb"
      const dateMatch = dateStr.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
      if (!dateMatch) return null;

      const day = parseInt(dateMatch[1], 10);
      const monthStr = dateMatch[2];

      const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
      if (!timeMatch) return null;
      const time = {
        hours: parseInt(timeMatch[1], 10),
        minutes: parseInt(timeMatch[2], 10),
      };

      const dateFullStr = `${day} ${monthStr} ${currentYear}`;
      let parsedDate = parseScreeningDate(dateFullStr, now);
      if (!parsedDate) return null;

      // Only roll to next year if date is more than 30 days in the past
      // (handles year boundary cases like Dec->Jan, but not recent past dates)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

      if (parsedDate < thirtyDaysAgo) {
        parsedDate = parseScreeningDate(`${day} ${monthStr} ${currentYear + 1}`, now);
        if (!parsedDate) return null;
      }

      return combineDateAndTime(parsedDate, time);
    } catch {
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
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

/** Create and return a new Phoenix Cinema scraper instance. */
export function createPhoenixScraper(): PhoenixScraper {
  return new PhoenixScraper();
}
