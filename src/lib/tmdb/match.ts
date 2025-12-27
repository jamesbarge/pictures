/**
 * Film Matching Logic
 * Matches scraped film titles to TMDB entries with fuzzy matching
 *
 * Key improvements for ambiguous titles:
 * - Reduced popularity bias (prevents blockbusters from matching art films)
 * - Ambiguity detection for short/common titles
 * - Match count penalty when multiple films have similar scores
 * - Requires year/director hints for ambiguous titles
 */

import { getTMDBClient } from "./client";
import type { TMDBSearchResult } from "./types";
import { analyzeTitleAmbiguity, hasSufficientMetadata } from "./ambiguity";

interface MatchHints {
  year?: number;
  director?: string;
  /** If true, skip ambiguity checks (for re-processing with known good metadata) */
  skipAmbiguityCheck?: boolean;
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
 *
 * For ambiguous titles (short, common words), requires year or director hints
 * to prevent matching blockbusters instead of the intended art film
 */
export async function matchFilmToTMDB(
  title: string,
  hints?: MatchHints
): Promise<MatchResult | null> {
  // Check if title is ambiguous and requires metadata
  if (!hints?.skipAmbiguityCheck) {
    const hasYear = !!hints?.year;
    const hasDirector = !!hints?.director;

    if (!hasSufficientMetadata(title, hasYear, hasDirector)) {
      const ambiguity = analyzeTitleAmbiguity(title);
      console.warn(
        `[tmdb-match] Skipping ambiguous title "${title}" - ` +
          `score: ${ambiguity.score.toFixed(2)}, reasons: ${ambiguity.reasons.join(", ")}. ` +
          `Provide year or director hint for better matching.`
      );
      return null;
    }
  }

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
 *
 * Scoring breakdown:
 * - Title similarity: 70% weight (0-0.7)
 * - Year match: +0.2 for exact, +0.1 for ±1 year
 * - Popularity: reduced to max 3% to prevent blockbuster bias
 * - Match count penalty: reduces confidence when many films have similar scores
 */
function findBestMatch(
  searchTitle: string,
  results: TMDBSearchResult[],
  hints?: MatchHints
): MatchResult | null {
  // Calculate scores for all candidates
  const scoredResults: Array<{
    result: TMDBSearchResult;
    titleSimilarity: number;
    score: number;
  }> = [];

  for (const result of results.slice(0, 10)) {
    // Calculate title similarity
    const titleSimilarity = Math.max(
      calculateSimilarity(searchTitle, result.title),
      calculateSimilarity(searchTitle, result.original_title)
    );

    // Skip if title similarity too low
    if (titleSimilarity < 0.6) continue;

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

    // Popularity bonus - REDUCED from 0.1 to 0.03 to prevent blockbuster bias
    // A film with popularity 1000 gets only 3% boost, not 10%
    const popularityBonus = Math.min(result.popularity / 1000, 0.03);

    // Calculate total score
    const score = titleSimilarity * 0.7 + yearBonus + popularityBonus;

    scoredResults.push({ result, titleSimilarity, score });
  }

  if (scoredResults.length === 0) return null;

  // Sort by score descending
  scoredResults.sort((a, b) => b.score - a.score);

  const best = scoredResults[0];

  // Calculate match count penalty
  // If many films have similar scores, reduce confidence
  // This catches cases like "Ten" where 5 films all score 0.85
  const competitorThreshold = best.score * 0.95; // Within 5% of best score
  const closeCompetitors = scoredResults.filter(
    (r) => r.score >= competitorThreshold
  ).length;

  let matchCountPenalty = 0;
  if (closeCompetitors >= 4) {
    matchCountPenalty = 0.15; // Many competitors - high uncertainty
  } else if (closeCompetitors >= 2) {
    matchCountPenalty = 0.08; // Some competitors - moderate uncertainty
  }

  // Apply penalty to confidence (not to score used for ranking)
  const adjustedConfidence = Math.min(best.score - matchCountPenalty, 1);

  // If we have year hint and it matches, boost confidence back up
  // Year match is a strong signal even with competitors
  let finalConfidence = adjustedConfidence;
  if (hints?.year && best.result.release_date) {
    const bestYear = parseInt(best.result.release_date.split("-")[0], 10);
    if (bestYear === hints.year) {
      // Recover half the penalty if year matches exactly
      finalConfidence = Math.min(
        adjustedConfidence + matchCountPenalty * 0.5,
        1
      );
    }
  }

  // Only return if confidence is above threshold
  if (finalConfidence >= 0.6) {
    return {
      tmdbId: best.result.id,
      confidence: finalConfidence,
      title: best.result.title,
      year: best.result.release_date
        ? parseInt(best.result.release_date.split("-")[0], 10)
        : 0,
      posterPath: best.result.poster_path,
    };
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
