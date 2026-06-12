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

import { getYear, addYears } from "date-fns";
import { chromium } from "rebrowser-playwright";

import { BOT_USER_AGENT } from "../constants";
import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";
import {
  combineDateAndTime,
  parseScreeningDate,
  parseScreeningTime,
} from "../utils/date-parser";
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

      // Extract listings from the schedule section.
      // IMPORTANT: use innerText (NOT textContent) so the rendered line breaks
      // are preserved. The blocks are structured one item per line —
      //   "The Drama\n\n2025 | USA | 105 min\nFri 12 June at 11.00am ..."
      // parseListingText() relies on splitting on "\n" to separate the title
      // from the metadata/date lines. textContent collapses everything onto a
      // single run ("...105 minFri 12 June..."), which broke title extraction.
      const listings = await page.evaluate(() => {
        const textElements = document.querySelectorAll('.et_pb_text_inner');
        const results: Array<{ text: string; link: string | null }> = [];

        textElements.forEach(el => {
          const text = (el as HTMLElement).innerText?.trim() || "";
          // Check for links anywhere in the element or its parent column
          const link = el.querySelector('a[href*="tinyurl"], a[href*="ticketsolve"], a.et_pb_button')?.getAttribute('href')
            || el.closest('.et_pb_column')?.querySelector('a[href*="tinyurl"], a[href*="ticketsolve"]')?.getAttribute('href')
            || null;

          // Look for patterns with date/time info. The site writes FULL month
          // names ("June", "July"), so match a 3-letter prefix followed by any
          // trailing letters; the "at <time>" check tolerates spaces in "2.00 pm".
          if (text.match(/\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*/i) &&
              text.match(/at\s+\d{1,2}[.:]\d{2}\s*(am|pm)/i)) {
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

    // Extract date/time patterns from the full text.
    // Pattern: "<DayName> DD <Month> at <rest-of-line>"
    //   - DayName: tolerate the site's variants (Tues, Weds, Thur, Thurs) via \w*.
    //   - Month: 3-letter prefix + optional trailing letters → matches both the
    //     FULL names the site actually uses ("June", "July") and any abbreviation.
    //     The old pattern required a bare 3-letter month, so "June" never matched
    //     "Jun" + "\s+at" — this was why the scraper had NEVER returned a screening.
    //   - Capture the REST OF THE LINE as the time blob (stop at newline) so
    //     multiple showtimes ("2.30pm and 7.30pm", "2.30pm (HOH) and 7.30pm") are
    //     all captured, including ones interrupted by parentheticals.
    const dateTimePattern = /(?:Mon|Tue|Tues|Wed|Weds|Thur|Thurs|Fri|Sat|Sun)\w*\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+at\s+([^\n]*)/gi;

    for (const match of text.matchAll(dateTimePattern)) {
      const [, dayNum, monthName, timeBlob] = match;
      const times = this.extractTimes(timeBlob);

      for (const time of times) {
        const datetime = this.parseDateTime(dayNum, monthName, time, currentYear);
        if (!datetime) {
          console.warn(`[${this.config.cinemaId}] Failed to parse showtime: ${dayNum} ${monthName} ${time}`);
          continue;
        }

        try {
          // Only roll a parsed date forward a year for a genuine year-boundary
          // case (e.g. a "5 Jan" listing seen in December). A date that is only
          // RECENTLY past — this week's already-shown screenings, which a
          // "what's on" page still lists — must NOT be bumped: doing so created
          // phantom screenings ~360 days in the future that the validator then
          // rejected (blocking the whole scrape). Recently-past dates stay in the
          // current year and are dropped by the `>= now` guard below.
          const daysFromNow = (datetime.getTime() - now.getTime()) / 86_400_000;
          const adjustedDatetime = daysFromNow < -180 ? addYears(datetime, 1) : datetime;

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

    // "HH.MMam" / "HH:MM pm" — tolerate a space before am/pm (the site writes
    // "2.00 pm"). Normalise by stripping internal whitespace so downstream
    // parseScreeningTime sees a clean token.
    const timePattern = /(\d{1,2}[.:]\d{2}\s*(?:am|pm))/gi;
    let remaining = text;
    for (const m of text.matchAll(timePattern)) {
      times.push(m[1].replace(/\s+/g, ""));
    }
    // Remove the detailed times from the text BEFORE scanning for bare-hour
    // times. Otherwise the bare-hour pattern matches the minute half of a
    // detailed time — e.g. "2.00pm" yields a spurious "00pm" — which then
    // parses to 00:xx and produces phantom early-morning / next-day screenings.
    remaining = remaining.replace(timePattern, " ");

    // Also handle bare "HHam" / "HH pm" format (no minutes)
    const simpleTimePattern = /(\d{1,2}\s*(?:am|pm))/gi;
    for (const m of remaining.matchAll(simpleTimePattern)) {
      times.push(m[1].replace(/\s+/g, ""));
    }

    return times;
  }

  private parseDateTime(
    dayNum: string,
    monthName: string,
    timeStr: string,
    currentYear: number
  ): Date | null {
    const time = parseScreeningTime(timeStr);
    if (!time) return null;

    const dateStr = `${dayNum} ${monthName} ${currentYear}`;
    const parsedDate = parseScreeningDate(dateStr);
    if (!parsedDate) return null;

    return combineDateAndTime(parsedDate, time);
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
