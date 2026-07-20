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

/**
 * True when a `.et_pb_text_inner` block's text looks like a listing (has a
 * date AND an "at <time>" showtime) rather than incidental page copy.
 *
 * MUST be kept textually identical to the inline check inside `scrape()`'s
 * `page.evaluate()` callback: that callback runs in the browser context and
 * can't import this function directly, so the two copies are hand-synced.
 * This exported copy exists so the regression test can exercise the real
 * filtering regex (a bare-hour time like "11am" must NOT be dropped — see the
 * Toy Story 5 case in david-lean.test.ts) instead of asserting against
 * `parseListingText`, which never runs this filter.
 */
export function isListingCandidateText(text: string): boolean {
  return (
    /\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*/i.test(text) &&
    /at\s+\d{1,2}([.:]\d{2})?\s*(am|pm)/i.test(text)
  );
}

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

          // Look for patterns with date/time info — kept in sync with
          // isListingCandidateText() below (this callback runs inside the
          // browser via page.evaluate and can't import it directly; the unit
          // test exercises the exported copy against the same real-world
          // strings, e.g. the Toy Story 5 bare-hour case).
          if (/\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*/i.test(text) &&
              /at\s+\d{1,2}([.:]\d{2})?\s*(am|pm)/i.test(text)) {
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

  /**
   * Parse one listing's text block into screenings.
   *
   * Public for tests: this scraper ran at ZERO yield for its entire life
   * because nothing exercised this parser (the month regex required "Jun"
   * while the site writes "June"). The fixture test encodes that failure.
   *
   * Format assumption (load-bearing): ONE date per line — the time blob
   * captures to end-of-line, so two dates on one line would mis-attribute
   * the second date's times to the first.
   */
  parseListingText(
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

      // "Special screenings" announcement blocks put an intro SENTENCE on the
      // first line (e.g. "We have two special screenings in August...") and
      // embed the real film title AFTER the times on each date line:
      //   "Wednesday 05 August at 7.00pm - ALL OF US STRANGERS plus Q&A"
      // When a line carries its own title it wins over the block's first line
      // (which is the sentence, not a film). Normal film blocks have no " - "
      // in the time blob and fall back to the block title.
      const { title: lineTitle, timePart } = this.splitEmbeddedTitle(timeBlob, filmTitle);
      const times = this.extractTimes(timePart);

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
            const cleanedTitle = this.cleanTitle(lineTitle);
            screenings.push({
              filmTitle: cleanedTitle,
              datetime: adjustedDatetime,
              bookingUrl: bookingUrl || this.config.baseUrl + "/#whatson",
              sourceId: `david-lean-${cleanedTitle.toLowerCase().replace(/\s+/g, "-").substring(0, 30)}-${adjustedDatetime.toISOString()}`,
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

  /**
   * Split a date line's post-"at" blob into its time portion and, when present,
   * the film title embedded after a " - " separator. The site's "special
   * screenings" announcement blocks use this shape:
   *   "7.00pm - ALL OF US STRANGERS plus Q&A"
   * so the block's first line is an intro sentence rather than a film name.
   * Returns the block-level fallback title for normal film blocks (no " - ").
   */
  private splitEmbeddedTitle(
    timeBlob: string,
    fallbackTitle: string
  ): { title: string; timePart: string } {
    const sep = timeBlob.indexOf(" - ");
    if (sep === -1) return { title: fallbackTitle, timePart: timeBlob };

    const timePart = timeBlob.slice(0, sep);
    // Strip trailing "plus Q&A" / "plus Q & A" annotations from the title.
    const title = timeBlob
      .slice(sep + 3)
      .replace(/\s*plus\s+Q\s*&\s*A.*$/i, "")
      .trim();

    // Only treat this as an embedded title if the portion before " - " actually
    // holds a time and we recovered a non-empty title that ISN'T ITSELF a time
    // — otherwise a normal time-range listing ("10.00am - 12.00pm") would have
    // its end time misread as the film title, silently dropping the screening.
    const titleLooksLikeTime = /^\d{1,2}\s*[.:]?\d{0,2}\s*(am|pm)?\s*(\(hoh\))?$/i.test(title);
    if (!title || !/\d/.test(timePart) || titleLooksLikeTime) {
      return { title: fallbackTitle, timePart: timeBlob };
    }
    return { title, timePart };
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
    // detailed time — "11.00am" yields a spurious "00am" (→ 00:xx phantom
    // early-morning/next-day screenings) and "2.00pm" a spurious "00pm"
    // (→ phantom noon, since 0pm parses to 12:00).
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
