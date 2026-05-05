/**
 * Film Similarity Service
 *
 * Uses PostgreSQL trigram similarity (pg_trgm) for fuzzy matching, with
 * length-aware confidence thresholds and year disambiguation to avoid
 * the "different film, similar title" trap (e.g., The Thin Man (1934)
 * vs The Third Man (1949)).
 *
 * Catches near-duplicates like:
 *   - "Blade Runner 2049" vs "BLADE RUNNER 2049 (4K Restoration)"
 *   - "The Godfather" vs "Godfather, The"
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

/** Lower bound for considering a film at all — below this, never propose. */
const MINIMUM_THRESHOLD = 0.25;

/** Hard threshold below which trigram results are not a candidate even with strong secondary signals. */
const LOW_CONFIDENCE_THRESHOLD = 0.35;

/** Maximum allowed year delta when both source and candidate have a year. */
const MAX_YEAR_DELTA = 5;

/** A film record with its trigram similarity score, returned by the pg_trgm query */
interface SimilarFilm {
  id: string;
  title: string;
  year: number | null;
  tmdbId: number | null;
  similarity: number;
}

/**
 * Length-aware similarity threshold.
 *
 * Trigram similarity is unstable on short titles — "The Thin Man" vs
 * "The Third Man" scores 64% even though they are unrelated films.
 * Require a higher trigram score for short titles where word swaps are
 * cheap.
 */
export function trigramThresholdFor(wordCount: number): number {
  if (wordCount <= 3) return 0.78;
  if (wordCount <= 5) return 0.7;
  return 0.6;
}

function countWords(title: string): number {
  return title.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Whether a candidate is rejected by the year-delta rule.
 *
 * Returns true only when *both* sides have a year and the gap exceeds
 * MAX_YEAR_DELTA — being strict here would lose legitimate matches when
 * one side has no year, which is common for repertory listings.
 */
export function violatesYearWindow(
  sourceYear: number | null | undefined,
  candidateYear: number | null | undefined
): boolean {
  if (sourceYear == null || candidateYear == null) return false;
  return Math.abs(sourceYear - candidateYear) > MAX_YEAR_DELTA;
}

/**
 * Find films similar to the given title using trigram similarity.
 * Uses PostgreSQL's pg_trgm extension for efficient fuzzy matching.
 */
export async function findSimilarFilmsByTitle(
  title: string,
  limit: number = 5,
  threshold: number = MINIMUM_THRESHOLD
): Promise<SimilarFilm[]> {
  const results = await db.execute(sql`
    SELECT
      id,
      title,
      year,
      tmdb_id,
      similarity(title, ${title}) as similarity
    FROM films
    WHERE similarity(title, ${title}) >= ${threshold}
    ORDER BY similarity(title, ${title}) DESC
    LIMIT ${limit}
  `);

  const rows = results as unknown as Array<{
    id: string;
    title: string;
    year: number | null;
    tmdb_id: number | null;
    similarity: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    year: r.year,
    tmdbId: r.tmdb_id,
    similarity: r.similarity,
  }));
}

/**
 * Find a matching film for the given title.
 *
 * Walks the top-N trigram candidates and returns the best one that
 * passes the length-aware threshold AND the year-window filter. This
 * is stricter than picking the absolute best trigram match — it prevents
 * "The Thin Man" being merged into "The Third Man" and similar
 * short-title swaps.
 *
 * Returns null when no candidate passes all filters.
 */
export async function findMatchingFilm(
  title: string,
  year?: number | null
): Promise<{ filmId: string; confidence: "high" | "medium" | "low" } | null> {
  const candidates = await findSimilarFilmsByTitle(title, 5, MINIMUM_THRESHOLD);

  if (candidates.length === 0) return null;

  const sourceWordCount = countWords(title);
  const threshold = trigramThresholdFor(sourceWordCount);

  for (const candidate of candidates) {
    // Length-aware trigram threshold
    if (candidate.similarity < threshold) continue;

    // Year-delta rejection (both sides have a year and delta > 5)
    if (violatesYearWindow(year, candidate.year)) {
      console.log(
        `[FilmSimilarity] Year mismatch — rejecting "${title}" (${year}) vs "${candidate.title}" (${candidate.year})`
      );
      continue;
    }

    // First candidate that passes all filters wins
    console.log(
      `[FilmSimilarity] High confidence match: "${title}" → "${candidate.title}" (${(candidate.similarity * 100).toFixed(0)}%)`
    );
    return { filmId: candidate.id, confidence: "high" };
  }

  // Best candidate exists but didn't clear the threshold — log for visibility.
  const best = candidates[0];
  if (best.similarity >= LOW_CONFIDENCE_THRESHOLD) {
    console.log(
      `[FilmSimilarity] Uncertain match: "${title}" vs "${best.title}" (${(best.similarity * 100).toFixed(0)}% — needs ≥${(threshold * 100).toFixed(0)}%) — not matching`
    );
  }

  return null;
}

/** Whether the similarity service is available. Always true: pg_trgm ships with Supabase. */
export function isSimilarityConfigured(): boolean {
  return true;
}
