/**
 * Film Matching Logic
 * Matches scraped film titles to TMDB entries with fuzzy matching
 */

import { getTMDBClient } from "./client";
import type { TMDBSearchResult } from "./types";

interface MatchHints {
  year?: number;
  director?: string;
}

interface MatchResult {
  tmdbId: number;
  confidence: number;
  title: string;
  year: number;
  posterPath: string | null;
}

/**
 * Normalize a film title for comparison
 * Removes common variations that shouldn't affect matching
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    // Remove "the" from start
    .replace(/^the\s+/i, "")
    // Remove common suffixes
    .replace(/\s*\([^)]*\)\s*$/, "") // Remove parenthetical info
    .replace(/\s*:\s*.*$/, "") // Remove subtitle after colon (for matching)
    // Normalize punctuation
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[–—]/g, "-")
    // Remove special characters for comparison
    .replace(/[^\w\s'-]/g, "")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate similarity between two strings (0-1)
 * Uses a combination of exact match, contains, and character overlap
 */
function calculateSimilarity(a: string, b: string): number {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);

  // Exact match after normalization
  if (normA === normB) return 1;

  // One contains the other
  if (normA.includes(normB) || normB.includes(normA)) {
    const shorter = Math.min(normA.length, normB.length);
    const longer = Math.max(normA.length, normB.length);
    return 0.8 + (shorter / longer) * 0.2;
  }

  // Levenshtein distance-based similarity
  const distance = levenshteinDistance(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  const similarity = 1 - distance / maxLen;

  return similarity;
}

/**
 * Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Determine if a film is repertory based on release year
 */
export function isRepertoryFilm(releaseDate: string | undefined): boolean {
  if (!releaseDate) return false;
  const year = parseInt(releaseDate.split("-")[0], 10);
  const currentYear = new Date().getFullYear();
  // Films more than 2 years old are considered repertory
  return year < currentYear - 2;
}

/**
 * Calculate decade string from year
 */
export function getDecade(year: number): string {
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

/**
 * Match a scraped film title to TMDB
 * Returns the best match with confidence score
 */
export async function matchFilmToTMDB(
  title: string,
  hints?: MatchHints
): Promise<MatchResult | null> {
  const client = getTMDBClient();

  // Search with year hint if provided
  const searchResults = await client.searchFilms(title, hints?.year);

  if (searchResults.results.length === 0) {
    // Try without year hint
    if (hints?.year) {
      const fallbackResults = await client.searchFilms(title);
      if (fallbackResults.results.length === 0) {
        return null;
      }
      return findBestMatch(title, fallbackResults.results, hints);
    }
    return null;
  }

  return findBestMatch(title, searchResults.results, hints);
}

/**
 * Find the best match from search results
 */
function findBestMatch(
  searchTitle: string,
  results: TMDBSearchResult[],
  hints?: MatchHints
): MatchResult | null {
  let bestMatch: MatchResult | null = null;
  let bestScore = 0;

  for (const result of results.slice(0, 10)) {
    // Calculate title similarity
    const titleSimilarity = Math.max(
      calculateSimilarity(searchTitle, result.title),
      calculateSimilarity(searchTitle, result.original_title)
    );

    // Year bonus - exact match or close
    let yearBonus = 0;
    if (hints?.year && result.release_date) {
      const resultYear = parseInt(result.release_date.split("-")[0], 10);
      if (resultYear === hints.year) {
        yearBonus = 0.2;
      } else if (Math.abs(resultYear - hints.year) === 1) {
        yearBonus = 0.1;
      }
    }

    // Popularity bonus (slight preference for well-known films)
    const popularityBonus = Math.min(result.popularity / 1000, 0.1);

    // Calculate total score
    const score = titleSimilarity * 0.7 + yearBonus + popularityBonus;

    if (score > bestScore && titleSimilarity >= 0.6) {
      bestScore = score;
      bestMatch = {
        tmdbId: result.id,
        confidence: Math.min(score, 1),
        title: result.title,
        year: result.release_date
          ? parseInt(result.release_date.split("-")[0], 10)
          : 0,
        posterPath: result.poster_path,
      };
    }
  }

  // Only return if confidence is above threshold
  if (bestMatch && bestMatch.confidence >= 0.6) {
    return bestMatch;
  }

  return null;
}

/**
 * Batch match multiple films
 * Rate limited to respect TMDB API limits (40 requests per 10 seconds)
 */
export async function batchMatchFilms(
  films: Array<{ title: string; hints?: MatchHints }>
): Promise<Map<string, MatchResult | null>> {
  const results = new Map<string, MatchResult | null>();

  for (let i = 0; i < films.length; i++) {
    const { title, hints } = films[i];

    try {
      const match = await matchFilmToTMDB(title, hints);
      results.set(title, match);
    } catch (error) {
      console.error(`Error matching "${title}":`, error);
      results.set(title, null);
    }

    // Rate limiting: ~4 requests per second
    if (i < films.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return results;
}
