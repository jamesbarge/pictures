/**
 * Close-Up Cinema Season Scraper
 * Extracts season information from Close-Up Film Centre
 *
 * Close-Up embeds season info in the film_url field of their JSON data:
 * - Example: /film_programmes/2025/close-up-on-stanley-kubrick/lolita
 * - Season slug is the third path segment
 *
 * This scraper fetches the same JSON as the screening scraper but
 * groups films by season instead of individual screenings.
 */

import * as cheerio from "cheerio";
import { BaseSeasonScraper } from "./base";
import type { RawSeason, RawSeasonFilm, SeasonScraperConfig } from "./types";

/**
 * Close-Up JSON show structure (from existing scraper)
 */
interface CloseUpShow {
  id: string;
  fp_id: string;
  title: string;
  blink: string;
  show_time: string;
  status: string;
  booking_availability: string;
  film_url: string;
}

/**
 * Configuration for Close-Up season scraping
 */
const CLOSE_UP_SEASON_CONFIG: SeasonScraperConfig = {
  cinemaId: "close-up-cinema",
  baseUrl: "https://www.closeupfilmcentre.com",
  seasonsPath: "/",
  requestsPerMinute: 10,
  delayBetweenRequests: 1000,
};

/**
 * Close-Up Season Scraper
 *
 * Simple Cheerio-based scraper that extracts seasons from the
 * embedded JSON data on the homepage.
 */
export class CloseUpSeasonScraper extends BaseSeasonScraper {
  config = CLOSE_UP_SEASON_CONFIG;

  /**
   * Fetch the homepage which contains the shows JSON
   */
  protected async fetchSeasonPages(): Promise<string[]> {
    const url = this.config.baseUrl;
    console.log(`[${this.config.cinemaId}] Fetching homepage: ${url}`);
    const html = await this.fetchUrl(url);
    return [html];
  }

  /**
   * Parse seasons from the embedded JSON data
   */
  protected async parseSeasons(htmlPages: string[]): Promise<RawSeason[]> {
    const html = htmlPages[0];
    const shows = this.extractShowsJson(html);

    if (!shows || shows.length === 0) {
      console.warn(`[${this.config.cinemaId}] No shows found in JSON`);
      return [];
    }

    console.log(`[${this.config.cinemaId}] Found ${shows.length} shows in JSON`);

    // Group shows by season
    const seasonMap = new Map<string, { shows: CloseUpShow[]; year: string }>();

    for (const show of shows) {
      if (!show.film_url) continue;

      const seasonInfo = this.extractSeasonFromUrl(show.film_url);
      if (!seasonInfo) continue;

      const { slug, year } = seasonInfo;
      const key = `${year}-${slug}`;

      if (!seasonMap.has(key)) {
        seasonMap.set(key, { shows: [], year });
      }
      seasonMap.get(key)!.shows.push(show);
    }

    console.log(`[${this.config.cinemaId}] Found ${seasonMap.size} seasons`);

    // Convert to RawSeason objects
    const seasons: RawSeason[] = [];

    for (const [key, { shows, year }] of seasonMap) {
      const slug = key.split("-").slice(1).join("-"); // Remove year prefix
      const season = this.buildSeason(slug, year, shows);
      if (season) {
        seasons.push(season);
      }
    }

    return seasons;
  }

  /**
   * Extract season slug and year from film URL
   * Example: /film_programmes/2025/close-up-on-stanley-kubrick/lolita
   * Returns: { slug: "close-up-on-stanley-kubrick", year: "2025" }
   */
  private extractSeasonFromUrl(
    filmUrl: string
  ): { slug: string; year: string } | null {
    // Pattern: /film_programmes/YEAR/SEASON-SLUG/FILM-SLUG
    const match = filmUrl.match(/\/film_programmes\/(\d{4})\/([^/]+)\//);
    if (!match) return null;

    const [, year, slug] = match;

    // Skip generic slugs that aren't real seasons
    if (this.isGenericSlug(slug)) return null;

    return { slug, year };
  }

  /**
   * Check if a slug is a generic category rather than a season
   */
  private isGenericSlug(slug: string): boolean {
    const genericSlugs = new Set([
      "screenings",
      "events",
      "special-events",
      "talks",
      "courses",
      "workshops",
      "members",
      "membership",
    ]);
    return genericSlugs.has(slug.toLowerCase());
  }

  /**
   * Build a RawSeason from grouped shows
   */
  private buildSeason(
    slug: string,
    year: string,
    shows: CloseUpShow[]
  ): RawSeason | null {
    if (shows.length === 0) return null;

    // Convert slug to readable name
    // "close-up-on-stanley-kubrick" -> "Close-Up on Stanley Kubrick"
    const name = this.slugToName(slug);

    // Extract unique films (same title may have multiple screenings)
    const filmMap = new Map<string, RawSeasonFilm>();
    let orderIndex = 0;

    for (const show of shows) {
      const normalizedTitle = show.title.toLowerCase().trim();
      if (filmMap.has(normalizedTitle)) continue;

      // Extract year from title if present
      const yearMatch = show.title.match(/\((\d{4})\)/);
      const filmYear = yearMatch ? parseInt(yearMatch[1]) : undefined;
      const cleanTitle = show.title.replace(/\s*\(\d{4}\)\s*$/, "").trim();

      filmMap.set(normalizedTitle, {
        title: cleanTitle,
        year: filmYear,
        orderIndex: orderIndex++,
        filmUrl: show.film_url
          ? `${this.config.baseUrl}${show.film_url}`
          : undefined,
      });
    }

    const films = Array.from(filmMap.values());
    if (films.length === 0) return null;

    // Try to extract director from season name
    const directorName = this.extractDirectorFromTitle(name);

    // Build season URL
    const websiteUrl = `${this.config.baseUrl}/film_programmes/${year}/${slug}/`;

    return {
      name,
      directorName,
      description: undefined, // Could fetch detail page, but keeping simple
      startDate: undefined,
      endDate: undefined,
      posterUrl: undefined,
      websiteUrl,
      sourceCinema: this.config.cinemaId,
      films,
      sourceId: `${year}-${slug}`,
    };
  }

  /**
   * Convert a URL slug to a readable name
   * "close-up-on-stanley-kubrick" -> "Close-Up on Stanley Kubrick"
   */
  private slugToName(slug: string): string {
    return slug
      .split("-")
      .map((word, index) => {
        // Keep small words lowercase unless first word
        const smallWords = ["on", "of", "the", "a", "an", "and", "or", "in", "at"];
        if (index > 0 && smallWords.includes(word.toLowerCase())) {
          return word.toLowerCase();
        }
        // Capitalize first letter
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(" ");
  }

  /**
   * Extract the shows JSON array from the page HTML
   * Same logic as the screening scraper
   */
  private extractShowsJson(html: string): CloseUpShow[] | null {
    // The site wraps JSON in single quotes: var shows ='[...]';
    const stringPattern = /var\s+shows\s*=\s*'(\[[\s\S]*?\])'\s*;/;
    const stringMatch = html.match(stringPattern);

    if (stringMatch && stringMatch[1]) {
      try {
        const parsed = JSON.parse(stringMatch[1]);
        if (Array.isArray(parsed)) {
          return parsed as CloseUpShow[];
        }
      } catch (e) {
        console.warn(`[${this.config.cinemaId}] Failed to parse JSON:`, e);
      }
    }

    // Fallback patterns
    const directPatterns = [
      /var\s+shows\s*=\s*(\[[\s\S]*?\]);/,
      /let\s+shows\s*=\s*(\[[\s\S]*?\]);/,
      /const\s+shows\s*=\s*(\[[\s\S]*?\]);/,
    ];

    for (const pattern of directPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (Array.isArray(parsed)) {
            return parsed as CloseUpShow[];
          }
        } catch {
          // Continue to next pattern
        }
      }
    }

    return null;
  }
}

/**
 * Factory function
 */
export function createCloseUpSeasonScraper(): CloseUpSeasonScraper {
  return new CloseUpSeasonScraper();
}
