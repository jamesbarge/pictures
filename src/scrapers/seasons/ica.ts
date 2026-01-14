/**
 * ICA Season Scraper
 * Extracts "strands" (curated seasons) from ICA Cinema
 *
 * ICA organizes films into strands:
 * - "In Focus: [Director Name]" - director spotlights
 * - "Long Takes" - extended runtime films
 * - "Off-Circuit" - alternative cinema
 *
 * URL pattern: https://www.ica.art/films/[strand-slug]
 */

import { BaseSeasonScraper } from "./base";
import type { RawSeason, RawSeasonFilm, SeasonScraperConfig } from "./types";

/**
 * Configuration for ICA season scraping
 */
const ICA_SEASON_CONFIG: SeasonScraperConfig = {
  cinemaId: "ica",
  baseUrl: "https://www.ica.art",
  seasonsPath: "/films",
  requestsPerMinute: 6,
  delayBetweenRequests: 3000,
};

/**
 * URL patterns that are NOT strands (exclude these)
 */
const EXCLUDED_PATHS = new Set([
  "/films/distribution",
  "/films/about",
  "/films/today",
  "/films/tomorrow",
  "/films/next-7-days",
]);

/**
 * Year patterns to exclude (archive pages)
 */
const YEAR_PATTERN = /^\/films\/\d{4}$/;

/**
 * ICA Season Scraper
 */
export class ICASeasonScraper extends BaseSeasonScraper {
  config = ICA_SEASON_CONFIG;

  /**
   * Fetch films page and strand pages
   */
  protected async fetchSeasonPages(): Promise<string[]> {
    const pages: string[] = [];

    // Fetch main films page
    const mainUrl = `${this.config.baseUrl}${this.config.seasonsPath}`;
    console.log(`[${this.config.cinemaId}] Fetching films page: ${mainUrl}`);
    const mainHtml = await this.fetchUrl(mainUrl);
    pages.push(JSON.stringify({ type: "main", url: mainUrl, html: mainHtml }));

    // Extract strand URLs
    const strandUrls = this.extractStrandUrls(mainHtml);
    console.log(`[${this.config.cinemaId}] Found ${strandUrls.length} strand pages`);

    // Fetch each strand page
    for (const url of strandUrls) {
      try {
        console.log(`[${this.config.cinemaId}] Fetching strand: ${url}`);
        const html = await this.fetchUrl(url);
        pages.push(JSON.stringify({ type: "strand", url, html }));
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
        if (page.type !== "strand") continue;

        const season = this.parseStrandPage(page.url, page.html);
        if (season && season.films.length > 0) {
          seasons.push(season);
        }
      } catch (error) {
        console.error(`[${this.config.cinemaId}] Failed to parse strand:`, error);
      }
    }

    return seasons;
  }

  /**
   * Extract strand URLs from the main films page
   *
   * Strategy: Look for navigation links to /films/[slug] that aren't
   * individual films (films have screening times on their page)
   */
  private extractStrandUrls(html: string): string[] {
    const $ = this.parseHtml(html);
    const urls: string[] = [];
    const seen = new Set<string>();

    // Look for strand links in navigation or category sections
    $('a[href^="/films/"]').each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      // Skip excluded paths
      if (EXCLUDED_PATHS.has(href)) return;
      if (YEAR_PATTERN.test(href)) return;

      // Skip paths that look like individual films (usually have more specific slugs)
      // Strand patterns: "in-focus-*", "long-takes", "off-circuit", etc.
      const slug = href.replace("/films/", "").replace(/\/$/, "");

      // Only include if it looks like a strand (hyphenated category name)
      if (!this.isLikelyStrand(slug)) return;

      // Normalize URL
      const fullUrl = `${this.config.baseUrl}${href}`;

      // Skip duplicates
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);

      urls.push(fullUrl);
    });

    return urls;
  }

  /**
   * Check if a slug looks like a strand (curated category)
   * rather than an individual film
   */
  private isLikelyStrand(slug: string): boolean {
    // Known strand patterns
    const strandPatterns = [
      /^in-focus-/,
      /^long-takes$/,
      /^off-circuit$/,
      /^artists-film/,
      /^special-event/,
      /^ica-presents/,
      /-season$/,
      /-retrospective$/,
      /-series$/,
    ];

    const lower = slug.toLowerCase();
    return strandPatterns.some((p) => p.test(lower));
  }

  /**
   * Parse a strand page into a RawSeason
   */
  private parseStrandPage(url: string, html: string): RawSeason | null {
    const $ = this.parseHtml(html);

    // Extract strand name
    const name =
      $("h1").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.replace(" | ICA", "").trim() ||
      "";

    if (!name) return null;

    // Extract description
    const description =
      $(".intro, .description, .content > p").first().text().trim() ||
      $('meta[property="og:description"]').attr("content") ||
      undefined;

    // Extract poster image
    const posterUrl =
      $('meta[property="og:image"]').attr("content") ||
      $(".hero-image img, .strand-image img").first().attr("src") ||
      undefined;

    // Extract films
    const films = this.extractFilms($);

    // Generate source ID from URL
    const slugMatch = url.match(/\/films\/([^/?#]+)/);
    const sourceId = slugMatch ? slugMatch[1] : this.generateSlug(name);

    // Extract director name for "In Focus" strands
    let directorName = this.extractDirectorFromTitle(name);

    // Special handling for "In Focus: Name" pattern
    if (name.toLowerCase().startsWith("in focus:")) {
      directorName = name.replace(/^in\s+focus:\s*/i, "").trim();
    }

    return {
      name,
      directorName,
      description: description?.substring(0, 500),
      startDate: undefined,
      endDate: undefined,
      posterUrl: posterUrl ? this.resolveUrl(posterUrl) : undefined,
      websiteUrl: url,
      sourceCinema: this.config.cinemaId,
      films,
      sourceId,
    };
  }

  /**
   * Extract films from a strand page
   */
  private extractFilms($: ReturnType<typeof this.parseHtml>): RawSeasonFilm[] {
    const films: RawSeasonFilm[] = [];
    const seenTitles = new Set<string>();

    // Look for film items in the strand
    $(".item.films > a, .film-item a, a[href*='/films/']").each((index, el) => {
      const $link = $(el);
      const href = $link.attr("href") || "";

      // Skip non-film links
      if (!href.startsWith("/films/")) return;
      if (EXCLUDED_PATHS.has(href)) return;
      if (YEAR_PATTERN.test(href)) return;

      // Get title from link text or image alt
      let title = $link.find("h2, h3, .title").text().trim() ||
                  $link.text().trim() ||
                  $link.find("img").attr("alt") ||
                  "";

      if (!title || title.length < 2) return;

      // Clean up title
      title = title.replace(/\s+/g, " ").trim();

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
export function createICASeasonScraper(): ICASeasonScraper {
  return new ICASeasonScraper();
}
