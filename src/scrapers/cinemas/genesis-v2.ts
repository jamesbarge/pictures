/**
 * Genesis Cinema Scraper (v2 - extends BaseScraper)
 *
 * Genesis uses Admit One booking system
 * Website: https://genesiscinema.co.uk
 * Booking: https://genesis.admit-one.co.uk
 *
 * This version extends BaseScraper to reuse common functionality:
 * - fetchUrl (replaces fetchPage)
 * - validate (inherited)
 * - delay (inherited)
 * - healthCheck (inherited)
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import type { CheerioAPI, CheerioSelection } from "../utils/cheerio-types";

// Re-export config and venue for compatibility
export { GENESIS_CONFIG, GENESIS_VENUE } from "./genesis";

export class GenesisScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "genesis",
    baseUrl: "https://genesiscinema.co.uk",
    requestsPerMinute: 15,
    delayBetweenRequests: 2000,
  };

  /**
   * Fetch all pages we need to scrape
   * Genesis requires fetching the what's-on page, then individual film pages
   */
  protected async fetchPages(): Promise<string[]> {
    // First, fetch the what's-on page to get film URLs
    const whatsOnHtml = await this.fetchUrl(`${this.config.baseUrl}/whats-on/`);
    const filmUrls = this.extractFilmUrls(whatsOnHtml);

    console.log(`[genesis] Found ${filmUrls.length} films to scrape`);

    // Fetch each film page
    const pages: string[] = [];
    for (const filmPath of filmUrls) {
      await this.delay(this.config.delayBetweenRequests);
      const url = filmPath.startsWith("http")
        ? filmPath
        : `${this.config.baseUrl}${filmPath}`;
      const html = await this.fetchUrl(url);
      pages.push(html);
    }

    return pages;
  }

  /**
   * Parse all fetched pages into screenings
   */
  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const allScreenings: RawScreening[] = [];

    for (const html of htmlPages) {
      const screenings = this.parseFilmPage(html);
      allScreenings.push(...screenings);
    }

    return allScreenings;
  }

  // ============================================================================
  // Genesis-specific parsing methods (unchanged from original)
  // ============================================================================

  private extractFilmUrls(html: string): string[] {
    const $ = this.parseHtml(html);
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

  private parseFilmPage(html: string): RawScreening[] {
    const $ = this.parseHtml(html);
    const screenings: RawScreening[] = [];

    // Extract film title from page
    const filmTitle = this.extractFilmTitle($);
    if (!filmTitle) {
      console.log(`[genesis] Could not extract title`);
      return [];
    }

    // Find showtime links - look inside whatson_panel divs
    const bookingLinks = $(".whatson_panel a[href*='admit-one.co.uk/seats']");
    console.log(`[genesis] "${filmTitle}": found ${bookingLinks.length} booking links in panels`);

    // Find all showtime links
    // Genesis format: <a href="https://genesis.admit-one.co.uk/seats/?perfCode=XXXX">HH:MM</a>
    bookingLinks.each((_, el) => {
      const $link = $(el);
      const bookingUrl = $link.attr("href") || "";
      const timeText = $link.text().trim();

      // Extract perfCode for unique ID
      const perfCodeMatch = bookingUrl.match(/perfCode=(\d+)/);
      const perfCode = perfCodeMatch ? perfCodeMatch[1] : null;

      if (!perfCode || !timeText) {
        console.log(`[genesis] Skipping link: no perfCode or timeText`);
        return;
      }

      // Find the date context - Genesis typically shows dates as section headers
      const dateContext = this.findDateContext($, $link);
      if (!dateContext) {
        console.log(`[genesis] No date context found for ${timeText}`);
        return;
      }
      console.log(`[genesis] Found: ${timeText} on ${dateContext}`);

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
      });
    });

    if (screenings.length > 0) {
      console.log(`[genesis] ${filmTitle}: ${screenings.length} screenings`);
    }

    return screenings;
  }

  private extractFilmTitle($: CheerioAPI): string | null {
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

  private findDateContext(
    $: CheerioAPI,
    $link: CheerioSelection
  ): string | null {
    // NEW: Genesis now uses tabbed panels with IDs like panel_20250104 (YYYYMMDD)
    // Look for parent panel with date in ID
    let $current = $link.parent();
    for (let i = 0; i < 10; i++) {
      const id = $current.attr("id") || "";

      // Check for panel_YYYYMMDD format
      const panelMatch = id.match(/panel_(\d{8})/);
      if (panelMatch) {
        return panelMatch[1]; // Return YYYYMMDD format
      }

      // Also check for data-target attribute on parent elements
      const dataTarget = $current.attr("data-target");
      if (dataTarget && /^\d{8}$/.test(dataTarget)) {
        return dataTarget;
      }

      $current = $current.parent();
      if ($current.length === 0) break;
    }

    // FALLBACK: Also check for traditional text-based date patterns
    $current = $link.parent();
    for (let i = 0; i < 5; i++) {
      const text = $current.text();
      const dateMatch = text.match(
        /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})?/i
      );
      if (dateMatch) {
        return dateMatch[0];
      }

      // Also check for day name + date pattern
      const dayDateMatch = text.match(
        /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)/i
      );
      if (dayDateMatch) {
        return dayDateMatch[0];
      }

      $current = $current.parent();
      if ($current.length === 0) break;
    }

    // Look for preceding sibling headers
    const $precedingHeaders = $link.parents().prevAll("h2, h3, h4, .date-header");
    for (let i = 0; i < $precedingHeaders.length; i++) {
      const headerText = $precedingHeaders.eq(i).text();
      const match = headerText.match(
        /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)/i
      );
      if (match) {
        return match[0];
      }
    }

    return null;
  }

  private parseDateTime(dateStr: string, timeStr: string): Date | null {
    try {
      let year: number;
      let month: number;
      let day: number;

      // NEW: Check for YYYYMMDD format (from panel IDs)
      if (/^\d{8}$/.test(dateStr)) {
        year = parseInt(dateStr.slice(0, 4));
        month = parseInt(dateStr.slice(4, 6)) - 1; // JS months are 0-indexed
        day = parseInt(dateStr.slice(6, 8));
      } else {
        // FALLBACK: Parse date like "20 December" or "Friday 20 December"
        const dateMatch = dateStr.match(
          /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})?/i
        );
        if (!dateMatch) return null;

        day = parseInt(dateMatch[1]);
        const monthName = dateMatch[2];
        year = dateMatch[3] ? parseInt(dateMatch[3]) : new Date().getFullYear();

        const months: Record<string, number> = {
          january: 0,
          february: 1,
          march: 2,
          april: 3,
          may: 4,
          june: 5,
          july: 6,
          august: 7,
          september: 8,
          october: 9,
          november: 10,
          december: 11,
        };

        month = months[monthName.toLowerCase()];
        if (month === undefined) return null;
      }

      // Parse time like "19:30" or "7:30pm"
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
      if (!timeMatch) return null;

      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const ampm = timeMatch[3]?.toLowerCase();

      if (ampm === "pm" && hours < 12) hours += 12;
      if (ampm === "am" && hours === 12) hours = 0;

      // Cinema heuristic: times 1-9 without AM/PM are likely PM
      if (!ampm && hours >= 1 && hours <= 9) {
        hours += 12;
      }

      const date = new Date(year, month, day, hours, minutes);

      // If date is in the past, assume next year (only for text-based dates without explicit year)
      if (date < new Date() && !/^\d{8}$/.test(dateStr)) {
        date.setFullYear(date.getFullYear() + 1);
      }

      return date;
    } catch {
      return null;
    }
  }

  /**
   * Override validate to add deduplication by sourceId
   * (Genesis-specific: uses perfCode for deduplication)
   */
  protected validate(screenings: RawScreening[]): RawScreening[] {
    const baseValidated = super.validate(screenings);
    const seen = new Set<string>();

    return baseValidated.filter((s) => {
      if (s.sourceId && seen.has(s.sourceId)) return false;
      if (s.sourceId) seen.add(s.sourceId);
      return true;
    });
  }
}

// Factory function
export function createGenesisScraper(): GenesisScraper {
  return new GenesisScraper();
}
