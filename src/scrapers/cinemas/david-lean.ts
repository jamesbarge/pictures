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

import { parse, getYear, addYears } from "date-fns";
import { chromium } from "rebrowser-playwright";

import { BOT_USER_AGENT } from "../constants";
import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";
import { combineDateAndTime } from "../utils/date-parser";
import { checkHealth } from "../utils/health-check";

const DAVID_LEAN_CONFIG: ScraperConfig = {
  cinemaId: "david-lean-cinema",
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

      // Extract booking URLs from the slider (title → URL map)
      // Booking links are in et_pb_slide elements, NOT in the text listings
      const sliderBookingMap = await page.evaluate(() => {
        const map: Record<string, string> = {};
        document.querySelectorAll('.et_pb_slide').forEach(slide => {
          const title = slide.querySelector('.et_pb_slide_title')?.textContent?.trim()?.toUpperCase() || '';
          const url = slide.querySelector('a.et_pb_more_button')?.getAttribute('href')
            || slide.querySelector('a.et_pb_slide_title_link')?.getAttribute('href')
            || null;
          if (title && url && !url.includes('#')) {
            map[title] = url;
          }
        });
        return map;
      });

      console.log(`[${this.config.cinemaId}] Found ${Object.keys(sliderBookingMap).length} booking URLs from slider`);

      // Extract listings from the schedule section
      const listings = await page.evaluate(() => {
        const textElements = document.querySelectorAll('.et_pb_text_inner');
        const results: Array<{ text: string; link: string | null }> = [];

        textElements.forEach(el => {
          const text = el.textContent?.trim() || "";
          // Check for links anywhere in the element or its parent column
          const link = el.querySelector('a[href*="tinyurl"], a[href*="ticketsolve"], a.et_pb_button')?.getAttribute('href')
            || el.closest('.et_pb_column')?.querySelector('a[href*="tinyurl"], a[href*="ticketsolve"]')?.getAttribute('href')
            || null;

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
      const sliderTitles = Object.keys(sliderBookingMap);
      const matchStats = { direct: 0, exact: 0, substring: 0, wordOverlap: 0, fallback: 0 };

      for (const listing of listings) {
        // Try to match booking URL: first from listing itself, then from slider by title
        let bookingUrl = listing.link;
        if (bookingUrl) {
          matchStats.direct++;
        } else {
          // Extract title from listing text and match against slider
          const lines = listing.text.split("\n").map(l => l.trim()).filter(Boolean);
          let firstLine = lines[0] || "";
          // Skip metadata lines (year | runtime | country)
          if (firstLine.match(/^\d{4}\s*\|/) && lines.length > 1) {
            firstLine = lines[1];
          }
          const titleUpper = firstLine.replace(/\s*\(Cert\s*\d+A?\)\s*/gi, "").trim().toUpperCase();

          // 1. Try exact match first
          bookingUrl = sliderBookingMap[titleUpper] || null;
          if (bookingUrl) {
            matchStats.exact++;
          }

          // 2. Try substring match with length-ratio guard to prevent false positives
          if (!bookingUrl && titleUpper.length > 5) {
            for (const sliderTitle of sliderTitles) {
              const shorter = Math.min(sliderTitle.length, titleUpper.length);
              const longer = Math.max(sliderTitle.length, titleUpper.length);
              if (shorter / longer >= 0.5 && (sliderTitle.includes(titleUpper) || titleUpper.includes(sliderTitle))) {
                console.log(`[${this.config.cinemaId}] Booking match (substring): "${titleUpper}" → "${sliderTitle}"`);
                bookingUrl = sliderBookingMap[sliderTitle];
                matchStats.substring++;
                break;
              }
            }
          }

          // 3. Try word overlap using Jaccard similarity (intersection/union) >= 0.5
          if (!bookingUrl && titleUpper.length > 5) {
            const titleWords = titleUpper.split(/\s+/).filter(w => w.length > 2);
            let bestMatch = "";
            let bestScore = 0;
            for (const sliderTitle of sliderTitles) {
              const sliderWords = sliderTitle.split(/\s+/).filter(w => w.length > 2);
              const overlap = titleWords.filter(w => sliderWords.includes(w)).length;
              const union = new Set([...titleWords, ...sliderWords]).size;
              const score = overlap / Math.max(union, 1);
              if (score > bestScore && score >= 0.5) {
                bestScore = score;
                bestMatch = sliderTitle;
              }
            }
            if (bestMatch) {
              console.log(`[${this.config.cinemaId}] Booking match (word-overlap ${(bestScore * 100).toFixed(0)}%): "${titleUpper}" → "${bestMatch}"`);
              bookingUrl = sliderBookingMap[bestMatch];
              matchStats.wordOverlap++;
            }
          }

          if (!bookingUrl) {
            matchStats.fallback++;
          }
        }

        const parsed = this.parseListingText(listing.text, bookingUrl, currentYear, now);
        for (const screening of parsed) {
          const key = `${screening.filmTitle}-${screening.datetime.toISOString()}`;
          if (!seenScreenings.has(key)) {
            seenScreenings.add(key);
            screenings.push(screening);
          }
        }
      }

      console.log(`[${this.config.cinemaId}] Booking URL matches: ${JSON.stringify(matchStats)}`);
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
              bookingUrl: bookingUrl || this.config.baseUrl + "/#whatson",
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

    return combineDateAndTime(parsedDate, { hours, minutes });
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
    return checkHealth(this.config.baseUrl, {
      headers: { "User-Agent": BOT_USER_AGENT },
    });
  }
}

/** Creates a scraper for David Lean Cinema (Croydon). */
export function createDavidLeanScraper(): DavidLeanScraper {
  return new DavidLeanScraper();
}
