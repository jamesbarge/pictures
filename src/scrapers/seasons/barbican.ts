/**
 * Barbican Season Scraper
 * Extracts series/seasons from Barbican Cinema
 *
 * Barbican organizes films into "series" at /whats-on/series/[name]
 * Examples: "New Releases", "Land Cinema", director retrospectives
 *
 * Strategy:
 * 1. Fetch the main cinema page to discover series links
 * 2. Fetch each series page to extract films
 * 3. Skip generic series like "New Releases"
 */

import { BaseSeasonScraper } from "./base";
import type { RawSeason, RawSeasonFilm, SeasonScraperConfig } from "./types";

/**
 * Configuration for Barbican season scraping
 */
const BARBICAN_SEASON_CONFIG: SeasonScraperConfig = {
  cinemaId: "barbican",
  baseUrl: "https://www.barbican.org.uk",
  seasonsPath: "/whats-on/cinema",
  requestsPerMinute: 6,
  delayBetweenRequests: 3000,
};

/**
 * Generic series to skip (not real seasons)
 */
const SKIP_SERIES = new Set([
  "new-releases",
  "all-films",
  "cinema",
  "coming-soon",
]);

/**
 * Barbican Season Scraper
 */
export class BarbicanSeasonScraper extends BaseSeasonScraper {
  config = BARBICAN_SEASON_CONFIG;

  /**
   * Fetch cinema page and all series pages
   */
  protected async fetchSeasonPages(): Promise<string[]> {
    const pages: string[] = [];

    // Fetch main cinema page to discover series
    const cinemaUrl = `${this.config.baseUrl}${this.config.seasonsPath}`;
    console.log(`[${this.config.cinemaId}] Fetching cinema page: ${cinemaUrl}`);
    const cinemaHtml = await this.fetchUrl(cinemaUrl);
    pages.push(cinemaHtml);

    // Extract series URLs
    const seriesUrls = this.extractSeriesUrls(cinemaHtml);
    console.log(`[${this.config.cinemaId}] Found ${seriesUrls.length} series pages`);

    // Fetch each series page
    for (const seriesUrl of seriesUrls) {
      try {
        console.log(`[${this.config.cinemaId}] Fetching series: ${seriesUrl}`);
        const seriesHtml = await this.fetchUrl(seriesUrl);
        pages.push(JSON.stringify({ url: seriesUrl, html: seriesHtml }));
        await this.delay(this.config.delayBetweenRequests);
      } catch (error) {
        console.error(
          `[${this.config.cinemaId}] Failed to fetch ${seriesUrl}:`,
          error
        );
      }
    }

    return pages;
  }

  /**
   * Parse seasons from fetched pages
   */
  protected async parseSeasons(htmlPages: string[]): Promise<RawSeason[]> {
    const seasons: RawSeason[] = [];

    // Skip first page (cinema listing), process series pages
    for (let i = 1; i < htmlPages.length; i++) {
      try {
        const { url, html } = JSON.parse(htmlPages[i]);
        const season = this.parseSeriesPage(url, html);
        if (season && season.films.length > 0) {
          seasons.push(season);
        }
      } catch (error) {
        console.error(`[${this.config.cinemaId}] Failed to parse series:`, error);
      }
    }

    return seasons;
  }

  /**
   * Extract series URLs from the cinema page
   */
  private extractSeriesUrls(html: string): string[] {
    const $ = this.parseHtml(html);
    const seriesUrls: string[] = [];
    const seen = new Set<string>();

    // Find links to series pages
    $('a[href*="/whats-on/series/"]').each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      // Extract series slug
      const match = href.match(/\/whats-on\/series\/([^/?#]+)/);
      if (!match) return;

      const slug = match[1].toLowerCase();

      // Skip generic series
      if (SKIP_SERIES.has(slug)) return;

      // Skip duplicates
      if (seen.has(slug)) return;
      seen.add(slug);

      const fullUrl = href.startsWith("http")
        ? href
        : `${this.config.baseUrl}${href}`;
      seriesUrls.push(fullUrl);
    });

    return seriesUrls;
  }

  /**
   * Parse a single series page into a RawSeason
   */
  private parseSeriesPage(url: string, html: string): RawSeason | null {
    const $ = this.parseHtml(html);

    // Extract series name from h1 or page title
    let name =
      $("h1").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.replace(" | Barbican", "").trim() ||
      "";

    if (!name) return null;

    // Extract description
    const description =
      $(".intro, .series-intro, .lead").first().text().trim() ||
      $('meta[property="og:description"]').attr("content") ||
      undefined;

    // Extract date range if present
    const dateText = $(".date-range, .dates, time").first().text().trim();
    const dateRange = dateText ? this.parseDateRange(dateText) : null;

    // Extract poster image
    const posterUrl =
      $('meta[property="og:image"]').attr("content") ||
      $(".series-image img, .hero-image img").first().attr("src") ||
      undefined;

    // Extract films from event links
    const films = this.extractFilmsFromPage($);

    // Extract series slug for sourceId
    const slugMatch = url.match(/\/series\/([^/?#]+)/);
    const sourceId = slugMatch ? slugMatch[1] : this.generateSlug(name);

    // Try to extract director from series name
    const directorName = this.extractDirectorFromTitle(name);

    return {
      name,
      directorName,
      description: description?.substring(0, 500),
      startDate: dateRange?.startDate,
      endDate: dateRange?.endDate,
      posterUrl: posterUrl ? this.resolveUrl(posterUrl) : undefined,
      websiteUrl: url,
      sourceCinema: this.config.cinemaId,
      films,
      sourceId,
    };
  }

  /**
   * Extract films from a series page
   */
  private extractFilmsFromPage($: ReturnType<typeof this.parseHtml>): RawSeasonFilm[] {
    const films: RawSeasonFilm[] = [];
    const seenTitles = new Set<string>();

    // Barbican event links: /whats-on/YEAR/event/SLUG
    $('a[href*="/event/"]').each((index, el) => {
      const $link = $(el);
      const href = $link.attr("href") || "";

      // Validate it's an event link
      if (!/\/whats-on\/\d{4}\/event\//.test(href)) return;

      // Get title from link text or nearby heading
      let title = $link.text().trim();

      // Clean up title - remove BBFC ratings
      title = title
        .replace(/\s+/g, " ")
        .replace(/\s*\((U|PG|12A?|15|18)\*?\)\s*$/i, "")
        .trim();

      if (!title || title.length < 2) return;

      // Skip duplicates
      const normalized = title.toLowerCase();
      if (seenTitles.has(normalized)) return;
      seenTitles.add(normalized);

      // Extract year from title if present
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
export function createBarbicanSeasonScraper(): BarbicanSeasonScraper {
  return new BarbicanSeasonScraper();
}
