/**
 * David Lean Cinema Scraper
 *
 * Cinema: The David Lean Cinema (Croydon Clocktower)
 * Address: Katharine Street, Croydon CR9 1ET
 * Website: https://www.davidleancinema.uk (redirected from .org.uk)
 *
 * Uses TicketSolve for booking (via tinyurl redirects)
 * Divi-based site with slider for featured films and listing section
 * Playwright-based scraper for dynamic content
 */

import { chromium } from "playwright";
import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";
import { parse, getYear, addYears } from "date-fns";

const DAVID_LEAN_CONFIG: ScraperConfig = {
  cinemaId: "david-lean",
  baseUrl: "https://www.davidleancinema.uk",
  requestsPerMinute: 10,
  delayBetweenRequests: 1000,
};

export class DavidLeanScraper implements CinemaScraper {
  config = DAVID_LEAN_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log(`[${this.config.cinemaId}] Starting David Lean Cinema scrape...`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      console.log(`[${this.config.cinemaId}] Loading homepage...`);
      await page.goto(this.config.baseUrl, {
        waitUntil: "networkidle",
        timeout: 30000
      });

      const screenings: RawScreening[] = [];
      const now = new Date();
      const currentYear = getYear(now);

      // Extract listings from the schedule section
      const listings = await page.evaluate(() => {
        const textElements = document.querySelectorAll('.et_pb_text_inner');
        const results: Array<{ text: string; link: string | null }> = [];

        textElements.forEach(el => {
          const text = el.textContent?.trim() || "";
          const link = el.querySelector('a.et_pb_button')?.getAttribute('href') || null;

          // Look for patterns with date/time info
          if (text.match(/\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i) &&
              text.match(/at\s+\d{1,2}[.:]\d{2}(am|pm)/i)) {
            results.push({ text, link });
          }
        });

        return results;
      });

      console.log(`[${this.config.cinemaId}] Found ${listings.length} listing entries`);

      // Process listings to extract screenings
      const seenScreenings = new Set<string>();

      for (const listing of listings) {
        const parsed = this.parseListingText(listing.text, listing.link, currentYear, now);
        for (const screening of parsed) {
          const key = `${screening.filmTitle}-${screening.datetime.toISOString()}`;
          if (!seenScreenings.has(key)) {
            seenScreenings.add(key);
            screenings.push(screening);
          }
        }
      }

      console.log(`[${this.config.cinemaId}] Found ${screenings.length} screenings total`);
      return screenings;
    } finally {
      await browser.close();
    }
  }

  private parseListingText(
    text: string,
    bookingUrl: string | null,
    currentYear: number,
    now: Date
  ): RawScreening[] {
    const screenings: RawScreening[] = [];

    // Extract film title (first line before year/country/runtime)
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    let filmTitle = lines[0];

    // Clean title - remove metadata if present
    if (filmTitle.match(/^\d{4}\s*\|/)) {
      // First line is metadata, skip to second
      filmTitle = lines.length > 1 ? lines[1] : "";
    }

    if (!filmTitle) return screenings;

    // Extract date/time patterns from the full text
    // Pattern: "Day DD Mon at HH.MMam/pm"
    const dateTimePattern = /(Mon|Tue|Tues|Wed|Thur|Thurs|Fri|Sat|Sun)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+at\s+([\d.:]+(?:am|pm))/gi;

    let match;
    while ((match = dateTimePattern.exec(text)) !== null) {
      const [, , dayNum, monthName, timeStr] = match;
      const times = this.extractTimes(timeStr + " " + text.substring(match.index + match[0].length, match.index + match[0].length + 30));

      for (const time of times) {
        try {
          const datetime = this.parseDateTime(dayNum, monthName, time, currentYear);
          const adjustedDatetime = datetime < now ? addYears(datetime, 1) : datetime;

          if (adjustedDatetime >= now) {
            screenings.push({
              filmTitle: this.cleanTitle(filmTitle),
              datetime: adjustedDatetime,
              bookingUrl: bookingUrl || `${this.config.baseUrl}/#whatson`,
              sourceId: `david-lean-${filmTitle.toLowerCase().replace(/\s+/g, "-").substring(0, 30)}-${adjustedDatetime.toISOString()}`,
            });
          }
        } catch {
          // Skip on error
        }
      }
    }

    return screenings;
  }

  private cleanTitle(title: string): string {
    // Remove certificate info like "(Cert 15)"
    return title.replace(/\s*\(Cert\s*\d+A?\)\s*/gi, "").trim();
  }

  private extractTimes(text: string): string[] {
    const times: string[] = [];
    const timePattern = /(\d{1,2}[.:]\d{2}(?:am|pm))/gi;

    let match;
    while ((match = timePattern.exec(text)) !== null) {
      times.push(match[1]);
    }

    // Also handle "HHam" or "HHpm" format
    const simpleTimePattern = /(\d{1,2}(?:am|pm))/gi;
    while ((match = simpleTimePattern.exec(text)) !== null) {
      const simple = match[1];
      // Don't add if we already have a detailed time for this hour
      if (!times.some(t => t.startsWith(simple.replace(/am|pm/i, "")))) {
        times.push(simple);
      }
    }

    return times;
  }

  private parseDateTime(
    dayNum: string,
    monthName: string,
    timeStr: string,
    currentYear: number
  ): Date {
    // Normalize time format: "2.30pm" or "2:30pm" -> "14:30", "11am" -> "11:00"
    const normalizedTime = this.normalizeTime(timeStr);
    const [hours, minutes] = normalizedTime.split(":").map(Number);

    // Parse date
    const dateStr = `${dayNum} ${monthName} ${currentYear}`;
    const parsedDate = parse(dateStr, "d MMM yyyy", new Date());

    parsedDate.setHours(hours, minutes, 0, 0);
    return parsedDate;
  }

  private normalizeTime(timeStr: string): string {
    // Convert "2.30pm" or "2:30pm" to "14:30"
    const match = timeStr.toLowerCase().match(/(\d{1,2})[.:]?(\d{2})?(am|pm)/);
    if (!match) return "00:00";

    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const period = match[3];

    if (period === "pm" && hours !== 12) {
      hours += 12;
    } else if (period === "am" && hours === 12) {
      hours = 0;
    }

    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
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

export function createDavidLeanScraper(): DavidLeanScraper {
  return new DavidLeanScraper();
}
