/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Peckhamplex Cinema Scraper
 *
 * Affordable independent cinema in Peckham
 * Website: https://www.peckhamplex.london
 *
 * No public API - scrapes HTML listings
 */

import * as cheerio from "cheerio";
import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";

// ============================================================================
// Peckhamplex Configuration
// ============================================================================

export const PECKHAMPLEX_CONFIG: ScraperConfig = {
  cinemaId: "peckhamplex",
  baseUrl: "https://www.peckhamplex.london",
  requestsPerMinute: 10,
  delayBetweenRequests: 2500,
};

export const PECKHAMPLEX_VENUE = {
  id: "peckhamplex",
  name: "Peckhamplex",
  shortName: "Peckhamplex",
  area: "Peckham",
  postcode: "SE15 5JR",
  address: "95A Rye Lane",
  features: ["independent", "affordable", "repertory"],
  website: "https://www.peckhamplex.london",
};

// ============================================================================
// Peckhamplex Scraper Implementation
// ============================================================================

export class PeckhamplexScraper implements CinemaScraper {
  config = PECKHAMPLEX_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log(`[peckhamplex] Starting scrape...`);

    try {
      const screenings: RawScreening[] = [];

      // Peckhamplex has individual film pages and a schedule
      // We'll scrape the main page and follow film links
      const mainHtml = await this.fetchPage("/");
      const filmUrls = this.extractFilmUrls(mainHtml);

      console.log(`[peckhamplex] Found ${filmUrls.length} films`);

      for (const filmUrl of filmUrls) {
        await this.delay();
        const filmScreenings = await this.scrapeFilmPage(filmUrl);
        screenings.push(...filmScreenings);
      }

      const validated = this.validate(screenings);
      console.log(`[peckhamplex] Total: ${validated.length} valid screenings`);

      return validated;
    } catch (error) {
      console.error(`[peckhamplex] Scrape failed:`, error);
      throw error;
    }
  }

  private async fetchPage(path: string): Promise<string> {
    const url = path.startsWith("http") ? path : `${this.config.baseUrl}${path}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    return response.text();
  }

  private extractFilmUrls(html: string): string[] {
    const $ = cheerio.load(html);
    const urls: string[] = [];
    const seen = new Set<string>();

    // Look for film page links - typically /film/film-name/
    $("a[href*='/film/']").each((_, el) => {
      const href = $(el).attr("href");
      if (href && !seen.has(href)) {
        seen.add(href);
        if (href.startsWith("/")) {
          urls.push(href);
        } else if (href.startsWith(this.config.baseUrl)) {
          urls.push(href.replace(this.config.baseUrl, ""));
        }
      }
    });

    // Also check for event/screening links
    $("a[href*='/screening/'], a[href*='/event/']").each((_, el) => {
      const href = $(el).attr("href");
      if (href && !seen.has(href)) {
        seen.add(href);
        if (href.startsWith("/")) {
          urls.push(href);
        }
      }
    });

    return urls;
  }

  private async scrapeFilmPage(filmPath: string): Promise<RawScreening[]> {
    const html = await this.fetchPage(filmPath);
    const $ = cheerio.load(html);
    const screenings: RawScreening[] = [];

    // Extract film title
    const filmTitle = this.extractFilmTitle($);
    if (!filmTitle) {
      console.log(`[peckhamplex] Could not extract title from ${filmPath}`);
      return [];
    }

    // Look for screening times
    // Peckhamplex often lists times in a schedule format
    $(".showtime, .screening-time, .time-slot, a[href*='book']").each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const href = $el.attr("href") || "";

      // Try to extract date and time
      const datetime = this.extractDateTime($, $el, text);
      if (!datetime) return;

      // Build booking URL
      let bookingUrl = href;
      if (!bookingUrl.startsWith("http")) {
        bookingUrl = `${this.config.baseUrl}${filmPath}`;
      }

      // Check for special attributes
      let format: string | undefined;
      let eventType: string | undefined;
      let eventDescription: string | undefined;

      const parentText = $el.parent().text().toLowerCase();
      if (parentText.includes("3d")) format = "3d";
      if (parentText.includes("subtitled") || parentText.includes("hoh")) {
        eventType = "subtitled";
        eventDescription = "Subtitled for Hard of Hearing";
      }
      if (parentText.includes("baby") || parentText.includes("watch with baby")) {
        eventType = "special_event";
        eventDescription = "Watch With Baby";
      }
      if (parentText.includes("autism friendly")) {
        eventType = "special_event";
        eventDescription = "Autism Friendly";
      }

      const sourceId = `peckhamplex-${filmTitle.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`;

      screenings.push({
        filmTitle,
        datetime,
        format,
        bookingUrl,
        eventType,
        eventDescription,
        sourceId,
      });
    });

    // Alternative: look for date/time patterns in the page content
    if (screenings.length === 0) {
      const pageScreenings = this.extractScreeningsFromContent($, filmTitle, filmPath);
      screenings.push(...pageScreenings);
    }

    if (screenings.length > 0) {
      console.log(`[peckhamplex] ${filmTitle}: ${screenings.length} screenings`);
    }

    return screenings;
  }

  private extractFilmTitle($: cheerio.CheerioAPI): string | null {
    const selectors = [
      "h1.film-title",
      "h1.title",
      ".film-header h1",
      "article h1",
      ".content h1",
      "h1",
    ];

    for (const selector of selectors) {
      const title = $(selector).first().text().trim();
      if (title && title.length > 2 && title.length < 200) {
        return title.replace(/\s*\(\d{4}\)\s*$/, "").trim();
      }
    }

    return null;
  }

  private extractDateTime(
    $: cheerio.CheerioAPI,
    $el: cheerio.Cheerio<cheerio.Element>,
    text: string
  ): Date | null {
    // Try to find date and time from element and context

    // Pattern 1: "20 Dec 14:30" or "20 December 2:30pm"
    const combinedMatch = text.match(
      /(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i
    );
    if (combinedMatch) {
      return this.parseDateTime(combinedMatch[1], combinedMatch[2], combinedMatch[3], combinedMatch[4], combinedMatch[5]);
    }

    // Pattern 2: Just time, look for date in parent
    const timeMatch = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (timeMatch) {
      // Find date context
      let dateStr: string | null = null;
      let $current = $el.parent();

      for (let i = 0; i < 5; i++) {
        const parentText = $current.text();
        const dateMatch = parentText.match(
          /(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)/i
        );
        if (dateMatch) {
          dateStr = dateMatch[0];
          break;
        }
        $current = $current.parent();
        if ($current.length === 0) break;
      }

      if (dateStr) {
        const dm = dateStr.match(/(\d{1,2})\s*(\w+)/);
        if (dm) {
          return this.parseDateTime(dm[1], dm[2], timeMatch[1], timeMatch[2], timeMatch[3]);
        }
      }
    }

    return null;
  }

  private extractScreeningsFromContent(
    $: cheerio.CheerioAPI,
    filmTitle: string,
    filmPath: string
  ): RawScreening[] {
    const screenings: RawScreening[] = [];
    const bodyText = $("body").text();

    // Look for date + time patterns in the content
    const pattern = /(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)[,\s]+(\d{4})?\s*[-–@]?\s*(\d{1,2}):(\d{2})\s*(am|pm)?/gi;

    let match;
    while ((match = pattern.exec(bodyText)) !== null) {
      const datetime = this.parseDateTime(match[1], match[2], match[4], match[5], match[6]);
      if (datetime && datetime > new Date()) {
        const sourceId = `peckhamplex-${filmTitle.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`;

        screenings.push({
          filmTitle,
          datetime,
          bookingUrl: `${this.config.baseUrl}${filmPath}`,
          sourceId,
        });
      }
    }

    return screenings;
  }

  private parseDateTime(
    day: string,
    month: string,
    hours: string,
    minutes: string,
    ampm?: string
  ): Date | null {
    try {
      const months: Record<string, number> = {
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

      const monthNum = months[month.toLowerCase()];
      if (monthNum === undefined) return null;

      let h = parseInt(hours);
      const m = parseInt(minutes);
      const d = parseInt(day);

      if (ampm?.toLowerCase() === "pm" && h < 12) h += 12;
      if (ampm?.toLowerCase() === "am" && h === 12) h = 0;

      const year = new Date().getFullYear();
      const date = new Date(year, monthNum, d, h, m);

      // If date is in past, assume next year
      if (date < new Date()) {
        date.setFullYear(year + 1);
      }

      return date;
    } catch {
      return null;
    }
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

  private async delay(): Promise<void> {
    await new Promise((r) => setTimeout(r, this.config.delayBetweenRequests));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.config.baseUrl, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Factory function
export function createPeckhamplexScraper(): PeckhamplexScraper {
  return new PeckhamplexScraper();
}
