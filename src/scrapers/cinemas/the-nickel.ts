/**
 * The Nickel Cinema Scraper (Clerkenwell)
 *
 * 37-seat micro-cinema specializing in cult/grindhouse films
 * Uses a custom Next.js booking site that requires JavaScript rendering
 *
 * Website: https://book.thenickel.co.uk
 */

import { chromium, type Browser, type Page } from "playwright";
import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";

// ============================================================================
// The Nickel Configuration
// ============================================================================

export const NICKEL_CONFIG: ScraperConfig = {
  cinemaId: "the-nickel",
  baseUrl: "https://book.thenickel.co.uk",
  requestsPerMinute: 10,
  delayBetweenRequests: 2000,
};

export const NICKEL_VENUE = {
  id: "the-nickel",
  name: "The Nickel",
  shortName: "The Nickel",
  area: "Clerkenwell",
  postcode: "EC1R 5BY",
  address: "117-119 Clerkenwell Road",
  features: ["independent", "cult", "grindhouse", "16mm", "vhs", "bar", "repertory"],
  website: "https://thenickel.co.uk",
};

// ============================================================================
// The Nickel Scraper Implementation
// ============================================================================

interface ScreeningData {
  title: string;
  year?: number;
  country?: string;
  director?: string;
  doorsTime: string;
  filmTime: string;
  date: string;
  format: string;
  bookingUrl: string;
  soldOut: boolean;
}

export class NickelScraper implements CinemaScraper {
  config = NICKEL_CONFIG;
  private browser: Browser | null = null;

  async scrape(): Promise<RawScreening[]> {
    console.log(`[the-nickel] Starting scrape with Playwright...`);

    try {
      // Launch browser
      this.browser = await chromium.launch({ headless: true });
      const page = await this.browser.newPage();

      // Navigate to the listings page
      await page.goto(this.config.baseUrl, { waitUntil: "networkidle" });

      // Wait for screenings to load (wait for loading message to disappear)
      await page.waitForSelector("a[href^='/screening/']", { timeout: 15000 });

      // Give it a bit more time for all screenings to render
      await page.waitForTimeout(1000);

      // Extract screening data from the page
      const screeningsData = await page.evaluate(() => {
        const screenings: ScreeningData[] = [];
        const screeningLinks = document.querySelectorAll("a[href^='/screening/']");

        screeningLinks.forEach((link) => {
          const href = link.getAttribute("href") || "";
          const container = link as HTMLElement;
          const text = container.textContent || "";

          // Extract title from first paragraph
          const titleEl = container.querySelector("p");
          const title = titleEl?.textContent?.trim() || "";

          // Skip if no title or if it's a special event like "NYE BASEMENT BASH"
          if (!title || title.includes("BASH") || title === "MYSTERY MOVIE") {
            return;
          }

          // Extract metadata (year, country, director) from second paragraph
          const paragraphs = container.querySelectorAll("p");
          let year: number | undefined;
          let country: string | undefined;
          let director: string | undefined;

          if (paragraphs.length > 1) {
            const metaText = paragraphs[1]?.textContent || "";
            const metaMatch = metaText.match(/\((\d{4}),\s*([^,]+),\s*([^)]+)\)/);
            if (metaMatch) {
              year = parseInt(metaMatch[1]);
              country = metaMatch[2].trim();
              director = metaMatch[3].trim();
            }
          }

          // Find doors and film times
          let doorsTime = "";
          let filmTime = "";
          const doorsMatch = text.match(/Doors\s+(\d{1,2}(?:\.\d{2})?(?:am|pm)?)/i);
          const filmMatch = text.match(/Film\s+(\d{1,2}(?:\.\d{2})?(?:am|pm)?)/i);
          if (doorsMatch) doorsTime = doorsMatch[1];
          if (filmMatch) filmTime = filmMatch[1];

          // Find date (format: "Sunday 21.12" or "Tuesday 6.1")
          const dateMatch = text.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\.(\d{1,2})/i);
          let date = "";
          if (dateMatch) {
            date = `${dateMatch[1]} ${dateMatch[2]}.${dateMatch[3]}`;
          }

          // Find format
          const format = text.includes("Digital") ? "digital" :
                        text.includes("35mm") ? "35mm" :
                        text.includes("16mm") ? "16mm" : "digital";

          // Check if sold out
          const soldOut = text.toLowerCase().includes("sold out");

          screenings.push({
            title,
            year,
            country,
            director,
            doorsTime,
            filmTime,
            date,
            format,
            bookingUrl: `https://book.thenickel.co.uk${href}`,
            soldOut,
          });
        });

        return screenings;
      });

      console.log(`[the-nickel] Found ${screeningsData.length} raw screenings`);

      // Convert to RawScreening format
      const screenings = this.convertToRawScreenings(screeningsData);
      const validated = this.validate(screenings);

      console.log(`[the-nickel] ${validated.length} valid screenings after filtering`);

      return validated;
    } catch (error) {
      console.error(`[the-nickel] Scrape failed:`, error);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }
  }

  private convertToRawScreenings(data: ScreeningData[]): RawScreening[] {
    const screenings: RawScreening[] = [];
    const currentYear = new Date().getFullYear();

    for (const item of data) {
      if (item.soldOut) continue; // Skip sold out screenings

      // Parse the date (format: "Sunday 21.12")
      const dateMatch = item.date.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\.(\d{1,2})/i);
      if (!dateMatch) continue;

      const day = parseInt(dateMatch[2]);
      const month = parseInt(dateMatch[3]) - 1; // JavaScript months are 0-indexed

      // Parse the time (format: "8.30pm" or "8pm")
      const time = item.filmTime || item.doorsTime;
      if (!time) continue;

      const timeMatch = time.match(/(\d{1,2})(?:\.(\d{2}))?(am|pm)?/i);
      if (!timeMatch) continue;

      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const ampm = timeMatch[3]?.toLowerCase();

      // The Nickel has evening showings, assume PM if no indicator and time is reasonable
      if (!ampm && hours >= 1 && hours <= 10) {
        hours += 12;
      } else if (ampm === "pm" && hours < 12) {
        hours += 12;
      } else if (ampm === "am" && hours === 12) {
        hours = 0;
      }

      // Create date
      let year = currentYear;
      const date = new Date(year, month, day, hours, minutes);

      // If date is in the past, assume next year
      if (date < new Date()) {
        year++;
        date.setFullYear(year);
      }

      const sourceId = `nickel-${item.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${date.toISOString()}`;

      screenings.push({
        filmTitle: item.title,
        datetime: date,
        year: item.year,
        director: item.director,
        format: item.format,
        bookingUrl: item.bookingUrl,
        sourceId,
      });
    }

    return screenings;
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
export function createNickelScraper(): NickelScraper {
  return new NickelScraper();
}
