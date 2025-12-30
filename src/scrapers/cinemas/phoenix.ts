/**
 * Phoenix Cinema Scraper
 *
 * Cinema: Phoenix Cinema (East Finchley)
 * Address: 52 High Rd, London N2 9PJ
 * Website: https://phoenixcinema.co.uk
 *
 * Uses INDY Systems GraphQL API at /graphql
 * Captures data by intercepting GraphQL responses from the page
 */

import { chromium, type Page } from "playwright";
import type { RawScreening } from "../types";

const PHOENIX_CONFIG = {
  cinemaId: "phoenix-east-finchley",
  baseUrl: "https://www.phoenixcinema.co.uk",
  graphqlUrl: "https://www.phoenixcinema.co.uk/graphql",
};

// GraphQL response types
interface PhoenixMovie {
  id: string;
  name: string;
  urlSlug: string;
  showingStatus: string;
  duration: number;
  genre: string;
  rating: string;
}

interface PhoenixShowing {
  id: string;
  time: string;
  screenId: string;
  published: boolean;
  past: boolean;
  movie: PhoenixMovie;
}

export interface CinemaScraper {
  config: { cinemaId: string };
  scrape(): Promise<RawScreening[]>;
}

export class PhoenixScraper implements CinemaScraper {
  config = PHOENIX_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log("[" + this.config.cinemaId + "] Starting Phoenix Cinema scrape...");

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const movies: PhoenixMovie[] = [];
    const allShowings: PhoenixShowing[] = [];

    // Intercept GraphQL responses to capture data
    // Use a promise to track when movies are loaded
    let moviesResolved = false;
    const moviesPromise = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.log("[" + this.config.cinemaId + "] Movies timeout - proceeding with " + movies.length + " movies");
        resolve();
      }, 10000);

      page.on("response", async (response) => {
        if (response.url().includes("/graphql")) {
          try {
            const text = await response.text();
            const json = JSON.parse(text);

            // Capture movies list
            if (json?.data?.movies?.data) {
              const movieData = json.data.movies.data as PhoenixMovie[];
              movies.push(...movieData);
              console.log("[" + this.config.cinemaId + "] Captured " + movieData.length + " movies from movies query");
              if (!moviesResolved) {
                moviesResolved = true;
                clearTimeout(timeout);
                resolve();
              }
            }

            // Capture showings
            if (json?.data?.showingsForDate?.data) {
              const showingData = json.data.showingsForDate.data as PhoenixShowing[];
              allShowings.push(...showingData);
              console.log("[" + this.config.cinemaId + "] Captured " + showingData.length + " showings");
            }
          } catch (e) {
            // Not JSON or parse error - ignore
          }
        }
      });
    });

    try {
      // Visit the whats-on page to trigger movies loading
      console.log("[" + this.config.cinemaId + "] Loading whats-on page...");
      await page.goto(this.config.baseUrl + "/whats-on/", { waitUntil: "networkidle" });

      // Wait for movies to be captured
      console.log("[" + this.config.cinemaId + "] Waiting for movies data...");
      await moviesPromise;
      console.log("[" + this.config.cinemaId + "] Movies captured: " + movies.length);

      // Get unique movie IDs that are currently showing
      const showingMovieIds = new Set<string>();
      for (const movie of movies) {
        if (movie.showingStatus === "Now Playing" || movie.showingStatus === "Previews") {
          showingMovieIds.add(movie.id);
        }
      }

      console.log("[" + this.config.cinemaId + "] Found " + showingMovieIds.size + " showing movies");

      // Visit each movie page to get showings
      // Limit to first 10 movies to avoid too many requests
      const movieSlugMap = new Map<string, PhoenixMovie>();
      for (const movie of movies) {
        if (showingMovieIds.has(movie.id)) {
          movieSlugMap.set(movie.urlSlug, movie);
        }
      }

      const slugs = Array.from(movieSlugMap.keys()).slice(0, 10);
      console.log("[" + this.config.cinemaId + "] Visiting " + slugs.length + " movie pages...");

      for (const slug of slugs) {
        console.log("[" + this.config.cinemaId + "] Visiting: " + slug);
        await page.goto(this.config.baseUrl + "/movie/" + slug, { waitUntil: "networkidle" });
        await page.waitForTimeout(1500);
      }

      // Convert showings to RawScreenings
      const screenings: RawScreening[] = [];
      const now = new Date();
      const seenIds = new Set<string>();

      for (const showing of allShowings) {
        // Skip duplicates
        if (seenIds.has(showing.id)) continue;
        seenIds.add(showing.id);

        // Skip past screenings
        const datetime = new Date(showing.time);
        if (datetime < now) continue;
        if (showing.past) continue;
        if (!showing.published) continue;

        const bookingUrl = this.config.baseUrl + "/showing/" + showing.id;

        screenings.push({
          filmTitle: showing.movie.name,
          datetime,
          bookingUrl,
          sourceId: "phoenix-" + showing.id,
        });
      }

      console.log("[" + this.config.cinemaId + "] Found " + screenings.length + " screenings total");
      return screenings;
    } finally {
      await browser.close();
    }
  }
}

export function createPhoenixScraper(): PhoenixScraper {
  return new PhoenixScraper();
}
