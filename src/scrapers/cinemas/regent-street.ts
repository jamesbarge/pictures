/**
 * Regent Street Cinema Scraper
 *
 * Cinema: Regent Street Cinema (Marylebone)
 * Address: 307 Regent Street, London W1B 2HW
 * Website: https://www.regentstreetcinema.com
 *
 * "Birthplace of British cinema" - first cinema screening in 1896
 * Only UK cinema with 16mm/35mm/Super8/4K projection
 *
 * Uses INDY Systems GraphQL API at /graphql
 * Same platform as Phoenix Cinema
 * Captures data by intercepting GraphQL responses from the page
 */

import { chromium } from "playwright";
import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";

const REGENT_STREET_CONFIG: ScraperConfig & { programmeUrl: string } = {
  cinemaId: "regent-street",
  baseUrl: "https://www.regentstreetcinema.com",
  programmeUrl: "https://www.regentstreetcinema.com/programme/",
  requestsPerMinute: 10,
  delayBetweenRequests: 1500,
};

// GraphQL response types
interface RegentStreetMovie {
  id: string;
  name: string;
  abbreviation: string;
  showingStatus: string;
  urlSlug?: string;
}

interface RegentStreetShowing {
  id: string;
  time: string; // ISO UTC datetime "2025-12-30T18:30:00Z"
  published: boolean;
  past: boolean;
  screenId: string;
  movie: RegentStreetMovie;
}

export class RegentStreetScraper implements CinemaScraper {
  config = REGENT_STREET_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log(`[${this.config.cinemaId}] Starting Regent Street Cinema scrape...`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const allShowings: RegentStreetShowing[] = [];

    // Track when showings are captured
    let showingsPromiseResolve: () => void;
    let showingsCaptured = false;
    const showingsPromise = new Promise<void>((resolve) => {
      showingsPromiseResolve = resolve;
      // Timeout after 20 seconds
      setTimeout(() => {
        if (!showingsCaptured) {
          console.log(`[${this.config.cinemaId}] Showings timeout - proceeding with ${allShowings.length} showings`);
          resolve();
        }
      }, 20000);
    });

    // Intercept GraphQL responses
    page.on("response", async (response) => {
      if (response.url().includes("/graphql")) {
        try {
          const text = await response.text();
          const json = JSON.parse(text);

          // Capture showingsForDate
          if (json?.data?.showingsForDate?.data) {
            const showings = json.data.showingsForDate.data as RegentStreetShowing[];
            allShowings.push(...showings);
            console.log(`[${this.config.cinemaId}] Captured ${showings.length} showings (total: ${allShowings.length})`);

            // Mark as captured after we have some showings
            if (!showingsCaptured && allShowings.length > 0) {
              // Wait a bit more for additional date batches
              setTimeout(() => {
                if (!showingsCaptured) {
                  showingsCaptured = true;
                  showingsPromiseResolve();
                }
              }, 3000);
            }
          }
        } catch {
          // Not JSON or parse error - ignore
        }
      }
    });

    try {
      // Visit the programme page
      console.log(`[${this.config.cinemaId}] Loading programme page...`);
      await page.goto(this.config.programmeUrl, { waitUntil: "networkidle", timeout: 60000 });

      // Wait for showings to be captured
      console.log(`[${this.config.cinemaId}] Waiting for showings data...`);
      await showingsPromise;
      console.log(`[${this.config.cinemaId}] Showings captured: ${allShowings.length}`);

      // Convert showings to RawScreenings
      const screenings: RawScreening[] = [];
      const now = new Date();
      const seenIds = new Set<string>();

      for (const showing of allShowings) {
        // Skip duplicates
        if (seenIds.has(showing.id)) continue;
        seenIds.add(showing.id);

        // Skip unpublished or past screenings
        if (!showing.published) continue;
        if (showing.past) continue;

        // Parse datetime - format is ISO UTC "2025-12-30T18:30:00Z"
        const datetime = new Date(showing.time);
        if (isNaN(datetime.getTime())) continue;
        if (datetime < now) continue;

        // Build booking URL
        const movieSlug = showing.movie.urlSlug || showing.movie.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const bookingUrl = `${this.config.baseUrl}/movie/${movieSlug}`;

        screenings.push({
          filmTitle: showing.movie.name,
          datetime,
          bookingUrl,
          sourceId: `regent-street-${showing.id}`,
        });
      }

      console.log(`[${this.config.cinemaId}] Found ${screenings.length} screenings total`);
      return screenings;
    } finally {
      await browser.close();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.config.baseUrl, {
        method: "HEAD",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PicturesBot/1.0)",
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function createRegentStreetScraper(): RegentStreetScraper {
  return new RegentStreetScraper();
}
