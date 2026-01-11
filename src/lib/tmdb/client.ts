/**
 * TMDB API Client
 * Handles all interactions with The Movie Database API
 */

import type {
  TMDBSearchResponse,
  TMDBMovieDetails,
  TMDBCredits,
  TMDBVideosResponse,
  TMDBReleaseDates,
  TMDBPersonSearchResponse,
  TMDBPersonDetails,
  TMDBPersonCredits,
} from "./types";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export class TMDBClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TMDB_API_KEY || "";
    if (!this.apiKey) {
      console.warn("TMDB API key not configured");
    }
  }

  private async fetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
    url.searchParams.set("api_key", this.apiKey);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      next: { revalidate: 86400 }, // Cache for 24 hours
    });

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Search for films by title
   */
  async searchFilms(query: string, year?: number): Promise<TMDBSearchResponse> {
    const params: Record<string, string> = { query };
    if (year) {
      params.year = year.toString();
    }
    return this.fetch<TMDBSearchResponse>("/search/movie", params);
  }

  /**
   * Get full details for a film by TMDB ID
   */
  async getFilmDetails(tmdbId: number): Promise<TMDBMovieDetails> {
    return this.fetch<TMDBMovieDetails>(`/movie/${tmdbId}`);
  }

  /**
   * Get credits (cast and crew) for a film
   */
  async getFilmCredits(tmdbId: number): Promise<TMDBCredits> {
    return this.fetch<TMDBCredits>(`/movie/${tmdbId}/credits`);
  }

  /**
   * Get videos (trailers, etc.) for a film
   */
  async getFilmVideos(tmdbId: number): Promise<TMDBVideosResponse> {
    return this.fetch<TMDBVideosResponse>(`/movie/${tmdbId}/videos`);
  }

  /**
   * Get release dates and certifications
   */
  async getReleaseDates(tmdbId: number): Promise<TMDBReleaseDates> {
    return this.fetch<TMDBReleaseDates>(`/movie/${tmdbId}/release_dates`);
  }

  /**
   * Get UK certification for a film
   */
  async getUKCertification(tmdbId: number): Promise<string | null> {
    const releaseDates = await this.getReleaseDates(tmdbId);
    const ukRelease = releaseDates.results.find((r) => r.iso_3166_1 === "GB");

    if (ukRelease) {
      // Find theatrical release (type 3) or general release
      const theatrical = ukRelease.release_dates.find((rd) => rd.type === 3);
      if (theatrical?.certification) {
        return theatrical.certification;
      }
      // Fall back to any certification
      const withCert = ukRelease.release_dates.find((rd) => rd.certification);
      return withCert?.certification || null;
    }

    return null;
  }

  /**
   * Get full film data including credits and certification
   */
  async getFullFilmData(tmdbId: number) {
    const [details, credits, certification] = await Promise.all([
      this.getFilmDetails(tmdbId),
      this.getFilmCredits(tmdbId),
      this.getUKCertification(tmdbId).catch(() => null),
    ]);

    const directors = credits.crew
      .filter((c) => c.job === "Director")
      .map((c) => c.name);

    const cast = credits.cast.slice(0, 10).map((c) => ({
      name: c.name,
      character: c.character,
      order: c.order,
      tmdbId: c.id,
    }));

    return {
      details,
      directors,
      cast,
      certification,
    };
  }

  // ============================================
  // Person (Director) Methods
  // ============================================

  /**
   * Search for a person by name
   */
  async searchPerson(query: string): Promise<TMDBPersonSearchResponse> {
    return this.fetch<TMDBPersonSearchResponse>("/search/person", { query });
  }

  /**
   * Get full details for a person by TMDB ID
   */
  async getPersonDetails(personId: number): Promise<TMDBPersonDetails> {
    return this.fetch<TMDBPersonDetails>(`/person/${personId}`);
  }

  /**
   * Get a person's movie credits (filmography)
   */
  async getPersonCredits(personId: number): Promise<TMDBPersonCredits> {
    return this.fetch<TMDBPersonCredits>(`/person/${personId}/movie_credits`);
  }

  /**
   * Find a director's TMDB ID by name
   * Returns the best match who is known for directing
   */
  async findDirectorId(name: string): Promise<number | null> {
    const results = await this.searchPerson(name);

    if (results.total_results === 0) {
      return null;
    }

    // Prioritize people known for directing
    const director = results.results.find(
      (p) => p.known_for_department === "Directing"
    );

    if (director) {
      return director.id;
    }

    // Fall back to first result if no explicit director found
    // (some directors are listed as "Production" etc.)
    return results.results[0].id;
  }

  /**
   * Get director data including bio and filmography
   */
  async getDirectorData(personId: number) {
    const [details, credits] = await Promise.all([
      this.getPersonDetails(personId),
      this.getPersonCredits(personId),
    ]);

    // Filter to directed films only
    const directedFilms = credits.crew
      .filter((c) => c.job === "Director")
      .sort((a, b) => {
        // Sort by release date descending
        const dateA = a.release_date || "";
        const dateB = b.release_date || "";
        return dateB.localeCompare(dateA);
      })
      .map((film) => ({
        tmdbId: film.id,
        title: film.title,
        originalTitle: film.original_title,
        releaseDate: film.release_date,
        posterPath: film.poster_path,
        voteAverage: film.vote_average,
      }));

    return {
      details,
      directedFilms,
      totalFilms: directedFilms.length,
    };
  }

  // Static methods for image URLs

  /**
   * Get poster URL for a film
   * @param posterPath - The poster_path from TMDB
   * @param size - Image size: w92, w154, w185, w342, w500, w780, original
   */
  static getPosterUrl(
    posterPath: string | null,
    size: "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original" = "w342"
  ): string | null {
    if (!posterPath) return null;
    return `${TMDB_IMAGE_BASE}/${size}${posterPath}`;
  }

  /**
   * Get backdrop URL for a film
   * @param backdropPath - The backdrop_path from TMDB
   * @param size - Image size: w300, w780, w1280, original
   */
  static getBackdropUrl(
    backdropPath: string | null,
    size: "w300" | "w780" | "w1280" | "original" = "w780"
  ): string | null {
    if (!backdropPath) return null;
    return `${TMDB_IMAGE_BASE}/${size}${backdropPath}`;
  }

  /**
   * Get profile image URL for a person
   * @param profilePath - The profile_path from TMDB
   * @param size - Image size: w45, w185, h632, original
   */
  static getProfileUrl(
    profilePath: string | null,
    size: "w45" | "w185" | "h632" | "original" = "w185"
  ): string | null {
    if (!profilePath) return null;
    return `${TMDB_IMAGE_BASE}/${size}${profilePath}`;
  }
}

// Singleton instance
let tmdbClient: TMDBClient | null = null;

export function getTMDBClient(): TMDBClient {
  if (!tmdbClient) {
    tmdbClient = new TMDBClient();
  }
  return tmdbClient;
}
