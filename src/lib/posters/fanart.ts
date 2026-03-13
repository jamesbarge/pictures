/**
 * Fanart.tv API Client
 * https://fanart.tv/
 *
 * Provides artistic movie posters, backgrounds, and logos
 * Great for alternative/stylized poster art
 *
 * Free tier: Uses project API key
 * Personal API key: Higher rate limits
 */

import type { FanartMovieImages, FanartImage } from "./types";

const FANART_BASE_URL = "https://webservice.fanart.tv/v3/movies";

export class FanartClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.FANART_API_KEY || "";
    if (!this.apiKey) {
      console.warn("Fanart.tv API key not configured");
    }
  }

  private async fetch<T>(endpoint: string): Promise<T | null> {
    try {
      const url = `${FANART_BASE_URL}${endpoint}`;
      const response = await fetch(url, {
        headers: {
          "api-key": this.apiKey,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null; // Movie not found in Fanart.tv
        }
        throw new Error(`Fanart.tv API error: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error("Fanart.tv fetch error:", error);
      return null;
    }
  }

  /**
   * Get movie images by TMDB ID
   */
  async getByTmdbId(tmdbId: number): Promise<FanartMovieImages | null> {
    return this.fetch<FanartMovieImages>(`/${tmdbId}`);
  }

  /**
   * Get movie images by IMDb ID
   */
  async getByImdbId(imdbId: string): Promise<FanartMovieImages | null> {
    return this.fetch<FanartMovieImages>(`/${imdbId}`);
  }

  /**
   * Get the best poster from Fanart.tv
   * Prefers English language posters with high likes
   */
  async getBestPoster(
    tmdbIdOrImdbId: number | string
  ): Promise<string | null> {
    const images =
      typeof tmdbIdOrImdbId === "number"
        ? await this.getByTmdbId(tmdbIdOrImdbId)
        : await this.getByImdbId(tmdbIdOrImdbId);

    if (!images?.movieposter?.length) {
      return null;
    }

    // Sort by likes (popularity) and prefer English
    const sorted = [...images.movieposter].sort((a, b) => {
      // English posters first
      const aIsEnglish = a.lang === "en" || a.lang === "";
      const bIsEnglish = b.lang === "en" || b.lang === "";
      if (aIsEnglish && !bIsEnglish) return -1;
      if (!aIsEnglish && bIsEnglish) return 1;

      // Then by likes
      return parseInt(b.likes) - parseInt(a.likes);
    });

    return sorted[0].url;
  }

  /**
   * Get all available poster URLs for a movie
   */
  async getAllPosters(
    tmdbIdOrImdbId: number | string
  ): Promise<FanartImage[]> {
    const images =
      typeof tmdbIdOrImdbId === "number"
        ? await this.getByTmdbId(tmdbIdOrImdbId)
        : await this.getByImdbId(tmdbIdOrImdbId);

    return images?.movieposter || [];
  }

  /**
   * Check if the API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

// Singleton instance
let fanartClient: FanartClient | null = null;

/** Get or create the singleton Fanart.tv API client for poster lookups. */
export function getFanartClient(): FanartClient {
  if (!fanartClient) {
    fanartClient = new FanartClient();
  }
  return fanartClient;
}
