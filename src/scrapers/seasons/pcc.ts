/**
 * Prince Charles Cinema Season Scraper
 * Extracts seasons from Prince Charles Cinema
 *
 * PCC has a dedicated /seasons-events/ section with curated programming:
 * - Sing-along screenings
 * - Director retrospectives
 * - Cult film marathons
 * - 70mm festivals
 *
 * URL pattern: https://princecharlescinema.com/seasons-events/[slug]/
 */

import { BaseSeasonScraper } from "./base";
import type { RawSeason, RawSeasonFilm, SeasonScraperConfig } from "./types";

/**
 * Configuration for PCC season scraping
 */
const PCC_SEASON_CONFIG: SeasonScraperConfig = {
  cinemaId: "prince-charles-cinema",
  baseUrl: "https://princecharlescinema.com",
  seasonsPath: "/seasons-events/",
  requestsPerMinute: 10,
  delayBetweenRequests: 1500,
};

/**
 * Prince Charles Cinema Season Scraper
 */
export class PCCSeasonScraper extends BaseSeasonScraper {
  config = PCC_SEASON_CONFIG;

  /**
   * Fetch seasons listing and detail pages
   */
  protected async fetchSeasonPages(): Promise<string[]> {
    const pages: string[] = [];

    // Fetch the seasons listing page
    const listingUrl = `${this.config.baseUrl}${this.config.seasonsPath}`;
    console.log(`[${this.config.cinemaId}] Fetching seasons listing: ${listingUrl}`);
    const listingHtml = await this.fetchUrl(listingUrl);
    pages.push(JSON.stringify({ type: "listing", url: listingUrl, html: listingHtml }));

    // Extract season URLs
    const seasonUrls = this.extractSeasonUrls(listingHtml);
    console.log(`[${this.config.cinemaId}] Found ${seasonUrls.length} season pages`);

    // Fetch each season detail page
    for (const url of seasonUrls) {
      try {
        console.log(`[${this.config.cinemaId}] Fetching: ${url}`);
        const html = await this.fetchUrl(url);
        pages.push(JSON.stringify({ type: "detail", url, html }));
        await this.delay(this.config.delayBetweenRequests);
      } catch (error) {
        console.error(`[${this.config.cinemaId}] Failed to fetch ${url}:`, error);
      }
    }

    return pages;
  }

  /**
   * Parse seasons from fetched pages
   */
  protected async parseSeasons(htmlPages: string[]): Promise<RawSeason[]> {
    const seasons: RawSeason[] = [];

    for (const pageJson of htmlPages) {
      try {
        const page = JSON.parse(pageJson);
        if (page.type !== "detail") continue;

        const season = this.parseSeasonPage(page.url, page.html);
        if (season && season.films.length > 0) {
          seasons.push(season);
        }
      } catch (error) {
        console.error(`[${this.config.cinemaId}] Failed to parse page:`, error);
      }
    }

    return seasons;
  }

  /**
   * Extract season URLs from the listing page
   */
  private extractSeasonUrls(html: string): string[] {
    const $ = this.parseHtml(html);
    const urls: string[] = [];
    const seen = new Set<string>();

    // Find links to season pages
    $('a[href*="/seasons-events/"]').each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      // Skip the main listing page
      if (href === "/seasons-events/" || href.endsWith("/seasons-events")) return;

      // Normalize URL
      let fullUrl = href;
      if (!href.startsWith("http")) {
        fullUrl = href.startsWith("/")
          ? `${this.config.baseUrl}${href}`
          : `${this.config.baseUrl}/${href}`;
      }

      // Ensure trailing slash for consistency
      if (!fullUrl.endsWith("/")) fullUrl += "/";

      // Skip duplicates
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);

      urls.push(fullUrl);
    });

    return urls;
  }

  /**
   * Parse a single season page
   */
  private parseSeasonPage(url: string, html: string): RawSeason | null {
    const $ = this.parseHtml(html);

    // Extract season name from h1 or page title
    let name =
      $("h1").first().text().trim() ||
      $("title").text().replace(/\s*[|–-]\s*Prince Charles Cinema.*$/i, "").trim() ||
      "";

    if (!name) return null;

    // Extract description
    const description =
      $(".season-description, .intro, .content p").first().text().trim() ||
      $('meta[name="description"]').attr("content") ||
      undefined;

    // Extract poster image
    const posterUrl =
      $('meta[property="og:image"]').attr("content") ||
      $(".season-image img, .hero img").first().attr("src") ||
      undefined;

    // Extract films
    const films = this.extractFilms($);

    // Generate source ID from URL slug
    const slugMatch = url.match(/\/seasons-events\/([^/?#]+)/);
    const sourceId = slugMatch ? slugMatch[1].replace(/\/$/, "") : this.generateSlug(name);

    // Try to extract director name
    const directorName = this.extractDirectorFromTitle(name);

    return {
      name,
      directorName,
      description: description?.substring(0, 500),
      startDate: undefined, // PCC doesn't always show date ranges
      endDate: undefined,
      posterUrl: posterUrl ? this.resolveUrl(posterUrl) : undefined,
      websiteUrl: url,
      sourceCinema: this.config.cinemaId,
      films,
      sourceId,
    };
  }

  /**
   * Extract films from a season page
   */
  private extractFilms($: ReturnType<typeof this.parseHtml>): RawSeasonFilm[] {
    const films: RawSeasonFilm[] = [];
    const seenTitles = new Set<string>();

    // Strategy 1: Look for film links in the content
    $('a[href*="/whats-on/"], a[href*="/film/"]').each((index, el) => {
      const $link = $(el);
      const href = $link.attr("href") || "";

      let title = $link.text().trim();
      if (!title || title.length < 2) return;

      // Clean up title
      title = title
        .replace(/\s+/g, " ")
        .replace(/\s*\((U|PG|12A?|15|18)\*?\)\s*$/i, "")
        .trim();

      const normalized = title.toLowerCase();
      if (seenTitles.has(normalized)) return;
      seenTitles.add(normalized);

      // Extract year from title
      const yearMatch = title.match(/\((\d{4})\)/);
      const year = yearMatch ? parseInt(yearMatch[1]) : undefined;
      const cleanTitle = title.replace(/\s*\(\d{4}\)\s*$/, "").trim();

      films.push({
        title: cleanTitle,
        year,
        orderIndex: index,
        filmUrl: this.resolveUrl(href),
      });
    });

    // Strategy 2: Look for film titles in headings or list items
    if (films.length === 0) {
      $("h2, h3, h4, li").each((index, el) => {
        const text = $(el).text().trim();

        // Skip if too short or looks like navigation
        if (text.length < 3 || text.length > 100) return;
        if (/^(home|about|contact|tickets|book)/i.test(text)) return;

        const normalized = text.toLowerCase();
        if (seenTitles.has(normalized)) return;
        seenTitles.add(normalized);

        // Extract year
        const yearMatch = text.match(/\((\d{4})\)/);
        const year = yearMatch ? parseInt(yearMatch[1]) : undefined;
        const cleanTitle = text.replace(/\s*\(\d{4}\)\s*$/, "").trim();

        films.push({
          title: cleanTitle,
          year,
          orderIndex: index,
        });
      });
    }

    return films;
  }

  /**
   * Resolve relative URL to absolute
   */
  private resolveUrl(url: string): string {
    if (url.startsWith("http")) return url;
    if (url.startsWith("//")) return `https:${url}`;
    if (url.startsWith("/")) return `${this.config.baseUrl}${url}`;
    return `${this.config.baseUrl}/${url}`;
  }
}

/**
 * Factory function
 */
export function createPCCSeasonScraper(): PCCSeasonScraper {
  return new PCCSeasonScraper();
}
