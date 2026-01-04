/**
 * Peckhamplex Cinema Scraper
 *
 * Affordable independent cinema in Peckham
 * Website: https://www.peckhamplex.london
 *
 * Scraping approach:
 * 1. Fetch /films/out-now to get list of film URLs
 * 2. For each film page, extract screenings from .book-tickets section
 * 3. Use <time datetime="..."> attributes for reliable datetime parsing
 */

import * as cheerio from "cheerio";
import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";
import type { CheerioAPI } from "../utils/cheerio-types";

// ============================================================================
// Peckhamplex Configuration
// ============================================================================

export const PECKHAMPLEX_CONFIG: ScraperConfig = {
  cinemaId: "peckhamplex",
  baseUrl: "https://www.peckhamplex.london",
  requestsPerMinute: 10,
  delayBetweenRequests: 2000,
};

export const PECKHAMPLEX_VENUE = {
  id: "peckhamplex",
  name: "Peckhamplex",
  shortName: "Peckhamplex",
  area: "Peckham",
  postcode: "SE15 4ST",
  address: "95a Rye Lane",
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

      // Fetch the films listing page
      const listingHtml = await this.fetchPage("/films/out-now");
      const filmUrls = this.extractFilmUrls(listingHtml);

      console.log(`[peckhamplex] Found ${filmUrls.length} films to scrape`);

      for (const filmUrl of filmUrls) {
        await this.delay();
        try {
          const filmScreenings = await this.scrapeFilmPage(filmUrl);
          screenings.push(...filmScreenings);
        } catch (error) {
          console.error(`[peckhamplex] Error scraping ${filmUrl}:`, error);
        }
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
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
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

    // Find all film links on the listing page
    $('a[href*="/film/"]').each((_, el) => {
      const href = $(el).attr("href");
      if (href && !seen.has(href)) {
        seen.add(href);
        // Normalize to full URL
        if (href.startsWith("/film/")) {
          urls.push(`${this.config.baseUrl}${href}`);
        } else if (href.includes("peckhamplex.london/film/")) {
          urls.push(href);
        }
      }
    });

    return urls;
  }

  private async scrapeFilmPage(filmUrl: string): Promise<RawScreening[]> {
    const html = await this.fetchPage(filmUrl);
    const $ = cheerio.load(html);
    const screenings: RawScreening[] = [];

    // Extract film title from h1.page-title or h1[itemprop="name"]
    const filmTitle = this.extractFilmTitle($);
    if (!filmTitle) {
      console.log(`[peckhamplex] Could not extract title from ${filmUrl}`);
      return [];
    }

    // Extract format (2D, 3D) from metadata
    const format = this.extractFormat($);

    // Find all screening times in the book-tickets section
    // Each time element has datetime attribute like "2026-01-04T17:30"
    $(".book-tickets time[datetime]").each((_, el) => {
      const $time = $(el);
      const datetimeAttr = $time.attr("datetime");

      if (!datetimeAttr) return;

      // Parse ISO datetime
      const datetime = this.parseDateTime(datetimeAttr);
      if (!datetime) return;

      // Get booking URL from parent anchor
      const $link = $time.closest("a");
      const bookingUrl = $link.attr("href") || filmUrl;

      // Generate unique source ID
      const sourceId = `peckhamplex-${filmTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}-${datetime.toISOString()}`;

      screenings.push({
        filmTitle,
        datetime,
        format: format || undefined,
        bookingUrl,
        sourceId,
      });
    });

    if (screenings.length > 0) {
      console.log(`[peckhamplex] ${filmTitle}: ${screenings.length} screenings`);
    } else {
      console.log(`[peckhamplex] ${filmTitle}: no screenings found`);
    }

    return screenings;
  }

  private extractFilmTitle($: cheerio.CheerioAPI): string | null {
    // Try specific selectors first
    const selectors = [
      'h1.page-title[itemprop="name"]',
      "h1.page-title",
      'h1[itemprop="name"]',
      ".film-details h1",
      "main h1:not(:contains('Peckhamplex'))",
    ];

    for (const selector of selectors) {
      const title = $(selector).first().text().trim();
      if (title && title !== "Peckhamplex" && title.length > 1 && title.length < 200) {
        // Remove year suffix if present (e.g., "Film Title (2024)")
        return title.replace(/\s*\(\d{4}\)\s*$/, "").trim();
      }
    }

    // Fallback: find first h1 that isn't the site name
    let fallbackTitle: string | null = null;
    $("h1").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text !== "Peckhamplex" && text.length > 1 && text.length < 200) {
        fallbackTitle = text.replace(/\s*\(\d{4}\)\s*$/, "").trim();
        return false; // break
      }
    });

    return fallbackTitle;
  }

  private extractFormat($: cheerio.CheerioAPI): string | null {
    // Look for format in the film metadata section
    const formatText = $(".film-details").text().toLowerCase();

    // Also check the page content
    const pageText = $("main").text().toLowerCase();

    if (formatText.includes("3d") || pageText.includes("3d digital")) {
      return "3D";
    }
    if (formatText.includes("imax")) {
      return "IMAX";
    }

    return null;
  }

  private parseDateTime(datetimeAttr: string): Date | null {
    try {
      // datetime attribute format: "2026-01-04T17:30"
      // This is local time, not UTC
      const [datePart, timePart] = datetimeAttr.split("T");
      if (!datePart || !timePart) return null;

      const [year, month, day] = datePart.split("-").map(Number);
      const [hours, minutes] = timePart.split(":").map(Number);

      if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
        return null;
      }

      // Create date in local time
      const date = new Date(year, month - 1, day, hours, minutes);

      // Validate the date
      if (isNaN(date.getTime())) {
        return null;
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
      // Must have title
      if (!s.filmTitle || s.filmTitle.trim() === "") return false;

      // Must have valid datetime
      if (!s.datetime || isNaN(s.datetime.getTime())) return false;

      // Must be in the future
      if (s.datetime < now) return false;

      // Check for suspicious times (before 10am is likely a parsing error)
      const hours = s.datetime.getHours();
      if (hours < 10) {
        console.warn(
          `[peckhamplex] Warning: suspicious time ${hours}:${s.datetime.getMinutes()} for ${s.filmTitle}`
        );
      }

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
