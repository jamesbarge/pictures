/**
 * Barbican Cinema Scraper
 * Scrapes film listings from barbican.org.uk
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import type { CheerioAPI } from "../utils/cheerio-types";

interface FilmInfo {
  title: string;
  url: string;
  nodeId: string;
}

export class BarbicanScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "barbican",
    baseUrl: "https://www.barbican.org.uk",
    requestsPerMinute: 6,
    delayBetweenRequests: 3000,
  };

  protected async fetchPages(): Promise<string[]> {
    // First get list of cinema films
    const listingUrl = `${this.config.baseUrl}/whats-on/series/new-releases`;
    console.log(`[${this.config.cinemaId}] Fetching film listing: ${listingUrl}`);

    const listingHtml = await this.fetchUrl(listingUrl);
    const $ = this.parseHtml(listingHtml);

    // Extract film URLs - they're in format /whats-on/2025/event/slug
    const filmUrls = new Set<string>();
    $('a[href*="/whats-on/"]').each((_, el) => {
      const href = $(el).attr("href");
      if (href && /\/whats-on\/\d{4}\/event\//.test(href)) {
        const fullUrl = href.startsWith("http") ? href : `${this.config.baseUrl}${href}`;
        filmUrls.add(fullUrl);
      }
    });

    console.log(`[${this.config.cinemaId}] Found ${filmUrls.size} film pages`);

    // Fetch each film's detail page to get node ID, then fetch performances
    const pages: string[] = [];
    const processedNodeIds = new Set<string>();

    for (const filmUrl of Array.from(filmUrls).slice(0, 30)) {
      try {
        console.log(`[${this.config.cinemaId}] Fetching: ${filmUrl}`);
        const filmHtml = await this.fetchUrl(filmUrl);
        const film$ = this.parseHtml(filmHtml);

        // Get title - strip BBFC ratings like (15), (12A), (PG), etc.
        let title = film$("h1").first().text().trim() ||
                   film$('meta[property="og:title"]').attr("content")?.replace(" | Barbican", "").trim() ||
                   "Unknown";

        // Normalize whitespace (including newlines) and remove BBFC ratings
        // Ratings can appear after a newline, e.g., "Die My Love\n(15)"
        title = title
          .replace(/\s+/g, " ")  // Collapse all whitespace (including newlines) to single spaces
          .replace(/\s*\((U|PG|12A?|15|18)\*?\)\s*$/i, "")  // Remove BBFC rating at end
          .trim();

        // Find node ID from the booking button endpoint or page
        const nodeMatch = filmHtml.match(/node\/(\d+)/);
        if (!nodeMatch) {
          console.log(`[${this.config.cinemaId}] No node ID found for ${title}`);
          continue;
        }

        const nodeId = nodeMatch[1];
        if (processedNodeIds.has(nodeId)) {
          continue; // Skip duplicates
        }
        processedNodeIds.add(nodeId);

        // Fetch performances page
        const performancesUrl = `${this.config.baseUrl}/whats-on/event/${nodeId}/performances`;
        console.log(`[${this.config.cinemaId}] Fetching performances for ${title}`);

        const performancesHtml = await this.fetchUrl(performancesUrl);

        // Store both title and performances HTML for parsing
        pages.push(JSON.stringify({ title, nodeId, html: performancesHtml }));

        await this.delay(this.config.delayBetweenRequests);
      } catch (error) {
        console.error(`[${this.config.cinemaId}] Failed to fetch ${filmUrl}:`, error);
      }
    }

    return pages;
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const screenings: RawScreening[] = [];

    for (const page of htmlPages) {
      try {
        const { title, nodeId, html } = JSON.parse(page);
        const $ = this.parseHtml(html);

        const filmScreenings = this.parsePerformances($, title, nodeId);
        screenings.push(...filmScreenings);

        if (filmScreenings.length > 0) {
          console.log(`[${this.config.cinemaId}] ${title}: ${filmScreenings.length} screenings`);
        }
      } catch (error) {
        console.error(`[${this.config.cinemaId}] Error parsing performances:`, error);
      }
    }

    console.log(`[${this.config.cinemaId}] Found ${screenings.length} screenings total`);
    return screenings;
  }

  private parsePerformances($: CheerioAPI, title: string, nodeId: string): RawScreening[] {
    const screenings: RawScreening[] = [];
    const now = new Date();

    // Each screening is in a .instance-listing element
    $(".instance-listing").each((_, el) => {
      const $instance = $(el);

      // Get datetime from time[datetime] attribute
      const timeEl = $instance.find("time[datetime]");
      const datetimeAttr = timeEl.attr("datetime");

      if (!datetimeAttr) return;

      const datetime = new Date(datetimeAttr);

      // Skip past screenings
      if (datetime < now) return;

      // Get venue/screen
      const venue = $instance.find(".instance-listing__venue strong").text().trim();

      // Get booking URL
      const bookingLink = $instance.find('a[href*="tickets.barbican"]').attr("href") ||
                         $instance.find('a[href*="choose-seats"]').attr("href");

      screenings.push({
        filmTitle: title,
        datetime,
        screen: venue || undefined,
        bookingUrl: bookingLink || `https://www.barbican.org.uk/whats-on/event/${nodeId}/performances`,
        sourceId: `barbican-${nodeId}-${datetime.toISOString()}`,
      });
    });

    return screenings;
  }
}

export function createBarbicanScraper(): BarbicanScraper {
  return new BarbicanScraper();
}
