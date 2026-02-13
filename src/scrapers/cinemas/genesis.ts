/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Genesis Cinema Scraper (Mile End)
 *
 * Genesis uses Admit One booking system
 * Website: https://genesiscinema.co.uk
 * Booking: https://genesis.admit-one.co.uk
 *
 * Has a quickbook endpoint at /include/quickbookdata.php
 */

import * as cheerio from "cheerio";
import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";
import { FestivalDetector } from "../festivals/festival-detector";

// ============================================================================
// Genesis Configuration
// ============================================================================

export const GENESIS_CONFIG: ScraperConfig = {
  cinemaId: "genesis",
  baseUrl: "https://genesiscinema.co.uk",
  requestsPerMinute: 15,
  delayBetweenRequests: 2000,
};

export const GENESIS_VENUE = {
  id: "genesis",
  name: "Genesis Cinema",
  shortName: "Genesis",
  area: "Mile End",
  postcode: "E1 4NS",
  address: "93-95 Mile End Road",
  features: ["independent", "bar", "cafe", "35mm", "repertory"],
  website: "https://genesiscinema.co.uk",
};

// ============================================================================
// Genesis Scraper Implementation
// ============================================================================

export class GenesisScraper implements CinemaScraper {
  config = GENESIS_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log(`[genesis] Starting scrape...`);
    await FestivalDetector.preload();

    try {
      const screenings: RawScreening[] = [];

      // Genesis shows listings on their what's-on page
      // We'll scrape the main listings page and individual film pages
      const whatsOnHtml = await this.fetchPage("/whats-on/");
      const filmUrls = this.extractFilmUrls(whatsOnHtml);

      console.log(`[genesis] Found ${filmUrls.length} films`);

      for (const filmUrl of filmUrls) {
        await this.delay();
        const filmScreenings = await this.scrapeFilmPage(filmUrl);
        screenings.push(...filmScreenings);
      }

      const validated = this.validate(screenings);
      console.log(`[genesis] Total: ${validated.length} valid screenings`);

      return validated;
    } catch (error) {
      console.error(`[genesis] Scrape failed:`, error);
      throw error;
    }
  }

  private async fetchPage(path: string): Promise<string> {
    const url = `${this.config.baseUrl}${path}`;
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

    // Find links to film pages
    // Genesis uses /event/film-name-here/ pattern
    $("a[href*='/event/']").each((_, el) => {
      const href = $(el).attr("href");
      if (href && !seen.has(href)) {
        seen.add(href);
        // Make sure it's a relative URL or full URL
        if (href.startsWith("/")) {
          urls.push(href);
        } else if (href.startsWith(this.config.baseUrl)) {
          urls.push(href.replace(this.config.baseUrl, ""));
        }
      }
    });

    return urls;
  }

  private async scrapeFilmPage(filmPath: string): Promise<RawScreening[]> {
    const html = await this.fetchPage(filmPath);
    const $ = cheerio.load(html);
    const screenings: RawScreening[] = [];

    // Extract film title from page
    const filmTitle = this.extractFilmTitle($);
    if (!filmTitle) {
      console.log(`[genesis] Could not extract title from ${filmPath}`);
      return [];
    }

    // Find all showtime links
    // Genesis format: <a href="https://genesis.admit-one.co.uk/seats/?perfCode=XXXX">HH:MM</a>
    $("a[href*='admit-one.co.uk/seats']").each((_, el) => {
      const $link = $(el);
      const bookingUrl = $link.attr("href") || "";
      const timeText = $link.text().trim();

      // Extract perfCode for unique ID
      const perfCodeMatch = bookingUrl.match(/perfCode=(\d+)/);
      const perfCode = perfCodeMatch ? perfCodeMatch[1] : null;

      if (!perfCode || !timeText) return;

      // Find the date context - Genesis typically shows dates as section headers
      // Look for parent elements with date information
      const dateContext = this.findDateContext($, $link);
      if (!dateContext) return;

      const datetime = this.parseDateTime(dateContext, timeText);
      if (!datetime) return;

      // Check for special screening types
      const screeningContext = $link.parent().text().toLowerCase();
      let format: string | undefined;
      let eventType: string | undefined;

      if (screeningContext.includes("35mm")) format = "35mm";
      if (screeningContext.includes("subtitled") || screeningContext.includes("sub)")) {
        eventType = "subtitled";
      }

      screenings.push({
        filmTitle,
        datetime,
        format,
        bookingUrl,
        eventType,
        sourceId: `genesis-${perfCode}`,
        ...FestivalDetector.detect("genesis", filmTitle, datetime, bookingUrl),
      });
    });

    if (screenings.length > 0) {
      console.log(`[genesis] ${filmTitle}: ${screenings.length} screenings`);
    }

    return screenings;
  }

  private extractFilmTitle($: cheerio.CheerioAPI): string | null {
    // Try various selectors for the film title
    const selectors = [
      "h1.film-title",
      "h1.event-title",
      ".film-header h1",
      "article h1",
      "h1",
    ];

    for (const selector of selectors) {
      const title = $(selector).first().text().trim();
      if (title && title.length > 2 && title.length < 200) {
        // Clean up the title - remove year suffix if present
        return title.replace(/\s*\(\d{4}\)\s*$/, "").trim();
      }
    }

    return null;
  }

  private findDateContext($: cheerio.CheerioAPI, $link: cheerio.Cheerio<cheerio.Element>): string | null {
    // Genesis embeds dates in panel IDs: id="panel_20260113" -> 2026-01-13
    // Look for panel IDs in parent elements

    let $current = $link.parent();
    for (let i = 0; i < 10; i++) {
      const id = $current.attr("id");
      if (id) {
        // Check for panel_YYYYMMDD pattern
        const panelMatch = id.match(/panel_(\d{4})(\d{2})(\d{2})/);
        if (panelMatch) {
          // Return as "13 Jan 2026" format for parseDateTime
          const year = panelMatch[1];
          const month = parseInt(panelMatch[2], 10);
          const day = panelMatch[3];
          const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          return `${parseInt(day, 10)} ${monthNames[month - 1]} ${year}`;
        }
      }

      $current = $current.parent();
      if ($current.length === 0) break;
    }

    // Fallback: look for text-based date patterns
    const abbrevMonthPattern = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i;
    const fullMonthPattern = /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})?/i;

    $current = $link.parent();
    for (let i = 0; i < 5; i++) {
      const text = $current.text();

      const abbrevMatch = text.match(abbrevMonthPattern);
      if (abbrevMatch) {
        return abbrevMatch[0];
      }

      const fullMatch = text.match(fullMonthPattern);
      if (fullMatch) {
        return fullMatch[0];
      }

      $current = $current.parent();
      if ($current.length === 0) break;
    }

    return null;
  }

  private parseDateTime(dateStr: string, timeStr: string): Date | null {
    try {
      // Parse date - supports both "20 December" and "13 Jan" formats
      // Also handles "Tue 13 Jan" or "Friday 20 December"
      const dateMatch = dateStr.match(/(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*(\d{4})?/i);
      if (!dateMatch) return null;

      const day = parseInt(dateMatch[1]);
      const monthName = dateMatch[2].toLowerCase();
      const year = dateMatch[3] ? parseInt(dateMatch[3]) : new Date().getFullYear();

      // Map both abbreviated and full month names to month index
      const months: Record<string, number> = {
        // Full names
        january: 0, february: 1, march: 2, april: 3,
        may: 4, june: 5, july: 6, august: 7,
        september: 8, october: 9, november: 10, december: 11,
        // Abbreviated names
        jan: 0, feb: 1, mar: 2, apr: 3,
        jun: 5, jul: 6, aug: 7,
        sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
      };

      const month = months[monthName];
      if (month === undefined) return null;

      // Parse time like "19:30" or "7:30pm"
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
      if (!timeMatch) return null;

      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const ampm = timeMatch[3]?.toLowerCase();

      if (ampm === "pm" && hours < 12) hours += 12;
      if (ampm === "am" && hours === 12) hours = 0;

      const date = new Date(year, month, day, hours, minutes);

      // If date is in the past, assume next year
      if (date < new Date()) {
        date.setFullYear(date.getFullYear() + 1);
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
      if (!s.bookingUrl) return false;

      // Deduplicate
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
      const response = await fetch(this.config.baseUrl, {
        method: "HEAD",
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Factory function
export function createGenesisScraper(): GenesisScraper {
  return new GenesisScraper();
}
