/**
 * Garden Cinema Scraper
 * Scrapes film listings from thegardencinema.co.uk
 *
 * The Garden Cinema is a single-screen independent cinema in North London (Golders Green).
 * The website has all screening data on the homepage organized by date blocks.
 *
 * Structure:
 * - div.date-block[data-date="YYYY-MM-DD"] contains films for that date
 * - div.films-list__by-date__film contains each film card
 * - a.screening links contain times (24-hour format) and booking URLs
 * - .films-list__by-date__film__stats contains "Director, Country, Year, Runtime"
 * - Times are already in 24-hour format (e.g., "11:00", "17:45")
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";

export class GardenCinemaScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "garden-cinema",
    baseUrl: "https://thegardencinema.co.uk",
    requestsPerMinute: 10,
    delayBetweenRequests: 1000,
  };

  protected async fetchPages(): Promise<string[]> {
    // Garden Cinema has all data on the homepage
    const url = this.config.baseUrl;
    console.log(`[${this.config.cinemaId}] Fetching homepage: ${url}`);

    const html = await this.fetchUrl(url);
    return [html];
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const screenings: RawScreening[] = [];
    const html = htmlPages[0];
    const $ = this.parseHtml(html);

    // Find all date blocks - each contains films for a specific date
    const dateBlocks = $(".date-block[data-date]");
    console.log(`[${this.config.cinemaId}] Found ${dateBlocks.length} date blocks`);

    const now = new Date();

    dateBlocks.each((_, dateBlock) => {
      const $dateBlock = $(dateBlock);
      const dateStr = $dateBlock.attr("data-date"); // Format: "2025-12-27"

      if (!dateStr) {
        console.warn(`[${this.config.cinemaId}] Date block missing data-date attribute`);
        return;
      }

      // Parse the date
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        console.warn(`[${this.config.cinemaId}] Invalid date: ${dateStr}`);
        return;
      }

      // Find all film cards within this date block
      const filmCards = $dateBlock.find(".films-list__by-date__film");

      filmCards.each((_, filmCard) => {
        const $film = $(filmCard);

        // Get film title - it's in the title link
        const $titleLink = $film.find(".films-list__by-date__film__title a");
        let title = $titleLink.text().trim();

        // Remove rating from title (e.g., "Little Women U" -> "Little Women")
        // Rating is in a span within the link
        const $rating = $film.find(".films-list__by-date__film__rating");
        const rating = $rating.text().trim();
        if (rating) {
          title = title.replace(rating, "").trim();
          // Clean up any trailing whitespace
          title = title.replace(/\s+$/, "").trim();
        }

        if (!title) {
          return;
        }

        // Parse stats for year and director: "Director, Country, Year, Runtime"
        // Example: "Greta Gerwig, USA, 2019, 135m."
        const stats = $film.find(".films-list__by-date__film__stats").text().trim();
        const { year, director } = this.parseStats(stats);

        // Get poster URL from image
        const posterUrl = $film.find(".films-list__by-date__film__thumb").attr("src") || undefined;

        // Find all screening times for this film
        const $screenings = $film.find("a.screening");

        $screenings.each((_, screeningEl) => {
          const $screening = $(screeningEl);
          const timeStr = $screening.text().trim(); // Format: "11:00", "12:30", "17:45"
          const bookingUrl = $screening.attr("href") || "";

          if (!timeStr || !bookingUrl) {
            return;
          }

          // Parse the time (already in 24-hour format)
          const datetime = this.parseDateTime(dateStr, timeStr);

          if (!datetime || datetime < now) {
            return;
          }

          // Create sourceId for deduplication
          const sourceId = `garden-cinema-${this.slugify(title)}-${datetime.toISOString()}`;

          screenings.push({
            filmTitle: title,
            datetime,
            bookingUrl: this.normalizeUrl(bookingUrl),
            sourceId,
            posterUrl: posterUrl ? this.normalizeUrl(posterUrl) : undefined,
            year,
            director,
          });
        });
      });
    });

    console.log(`[${this.config.cinemaId}] Found ${screenings.length} future screenings`);
    return screenings;
  }

  /**
   * Parse stats string to extract year and director
   * Format: "Director, Country, Year, Runtime"
   * Example: "Greta Gerwig, USA, 2019, 135m."
   */
  private parseStats(stats: string): { year?: number; director?: string } {
    if (!stats) {
      return {};
    }

    // Match year (4 digit number starting with 19 or 20)
    const yearMatch = stats.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : undefined;

    // Director is typically the first part before the first comma
    const parts = stats.split(",").map((s) => s.trim());
    const firstPart = parts[0];
    // First part is typically the director unless it's a country or year
    const director =
      firstPart && !firstPart.match(/^\d{4}$/) && !this.isCountry(firstPart)
        ? firstPart
        : undefined;

    return { year, director };
  }

  /**
   * Check if a string is likely a country name
   */
  private isCountry(str: string): boolean {
    const countries = [
      "USA", "UK", "France", "Germany", "Italy", "Spain", "Japan", "Canada",
      "Australia", "Norway", "Sweden", "Denmark", "Netherlands", "Belgium",
      "Ireland", "Mexico", "Brazil", "Argentina", "China", "South Korea",
      "India", "Poland", "Russia", "Austria", "Switzerland", "Hungary",
      "Czech Republic", "Romania", "Portugal", "Greece", "Finland", "New Zealand",
    ];
    return countries.some((c) => str.toLowerCase() === c.toLowerCase());
  }

  /**
   * Parse date and time into a Date object
   * @param dateStr - Date in YYYY-MM-DD format
   * @param timeStr - Time in HH:MM 24-hour format
   */
  private parseDateTime(dateStr: string, timeStr: string): Date | null {
    // Parse time - already in 24-hour format like "11:00", "17:45"
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!timeMatch) {
      console.warn(`[${this.config.cinemaId}] Invalid time format: ${timeStr}`);
      return null;
    }

    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);

    // Validate time - cinema screenings should be between 10:00 and 23:59
    // Times before 10:00 might be errors unless they're special morning screenings
    if (hours < 10 && hours !== 0) {
      console.warn(
        `[${this.config.cinemaId}] Unusual early time: ${timeStr} - verify this is correct`
      );
    }

    // Create date from ISO date string
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null;
    }

    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  /**
   * Create a URL-safe slug from a title
   */
  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 50);
  }

  /**
   * Normalize URL - ensure it's absolute
   */
  private normalizeUrl(url: string): string {
    if (url.startsWith("http")) {
      return url;
    }
    if (url.startsWith("/")) {
      return `${this.config.baseUrl}${url}`;
    }
    return `${this.config.baseUrl}/${url}`;
  }
}

export function createGardenCinemaScraper(): GardenCinemaScraper {
  return new GardenCinemaScraper();
}
