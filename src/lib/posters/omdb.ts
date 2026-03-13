/**
 * OMDB API Client
 * http://www.omdbapi.com/
 *
 * Free tier: 1,000 requests/day
 * Uses IMDb data for movie information and posters
 */

import type { OMDBSearchResult, OMDBMovieDetails } from "./types";

const OMDB_BASE_URL = "http://www.omdbapi.com";

export class OMDBClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OMDB_API_KEY || "";
    if (!this.apiKey) {
      console.warn("OMDB API key not configured");
    }
  }

  private async fetch<T>(params: Record<string, string>): Promise<T> {
    const url = new URL(OMDB_BASE_URL);
    url.searchParams.set("apikey", this.apiKey);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`OMDB API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Search for a movie by title
   */
  async searchByTitle(title: string, year?: number): Promise<OMDBSearchResult | null> {
    try {
      const params: Record<string, string> = {
        t: title, // Exact title search
        type: "movie",
      };

      if (year) {
        params.y = year.toString();
      }

      const result = await this.fetch<OMDBMovieDetails>(params);

      if (result.Response === "False") {
        return null;
      }

      return {
        Title: result.Title,
        Year: result.Year,
        imdbID: result.imdbID,
        Type: result.Type,
        Poster: result.Poster,
        Response: result.Response,
      };
    } catch (error) {
      console.error("OMDB search error:", error);
      return null;
    }
  }

  /**
   * Get movie details by IMDb ID
   */
  async getByImdbId(imdbId: string): Promise<OMDBMovieDetails | null> {
    try {
      const result = await this.fetch<OMDBMovieDetails>({
        i: imdbId,
        type: "movie",
      });

      if (result.Response === "False") {
        return null;
      }

      return result;
    } catch (error) {
      console.error("OMDB lookup error:", error);
      return null;
    }
  }

  /**
   * Get poster URL for a movie
   * Returns null if poster is "N/A" or not found
   */
  async getPosterUrl(
    titleOrImdbId: string,
    year?: number
  ): Promise<string | null> {
    let result: OMDBSearchResult | OMDBMovieDetails | null = null;

    // If it looks like an IMDb ID, use direct lookup
    if (titleOrImdbId.startsWith("tt")) {
      result = await this.getByImdbId(titleOrImdbId);
    } else {
      result = await this.searchByTitle(titleOrImdbId, year);
    }

    if (!result || !result.Poster || result.Poster === "N/A") {
      return null;
    }

    return result.Poster;
  }

  /**
   * Check if the API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

// Singleton instance
let omdbClient: OMDBClient | null = null;

/** Get or create the singleton OMDB API client for poster lookups. */
export function getOMDBClient(): OMDBClient {
  if (!omdbClient) {
    omdbClient = new OMDBClient();
  }
  return omdbClient;
}
