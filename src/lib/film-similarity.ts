/**
 * Film Similarity Service
 *
 * Uses PostgreSQL trigram similarity (pg_trgm) for fuzzy matching.
 *
 * Catches near-duplicates like:
 *   - "Blade Runner 2049" vs "BLADE RUNNER 2049 (4K Restoration)"
 *   - "The Godfather" vs "Godfather, The"
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

// Similarity thresholds for trigram matching
const HIGH_CONFIDENCE_THRESHOLD = 0.6; // Auto-accept match
const LOW_CONFIDENCE_THRESHOLD = 0.35; // Treat as uncertain — don't match
const MINIMUM_THRESHOLD = 0.25; // Below this, don't even consider

/** A film record with its trigram similarity score, returned by the pg_trgm query */
interface SimilarFilm {
  id: string;
  title: string;
  year: number | null;
  tmdbId: number | null;
  similarity: number;
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
 * Find a matching film for the given title, using trigram similarity.
 *
 * @param title - The film title to search for
 * @param year - Optional year for disambiguation (currently unused; reserved
 *               for future scoring once year-aware ranking lands)
 * @returns The best matching film ID, or null if no confident match
 */
export async function findMatchingFilm(
  title: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  year?: number | null
): Promise<{ filmId: string; confidence: "high" | "medium" | "low" } | null> {
  const similar = await findSimilarFilmsByTitle(title, 5, MINIMUM_THRESHOLD);

  if (similar.length === 0) return null;

  const best = similar[0];

  if (best.similarity >= HIGH_CONFIDENCE_THRESHOLD) {
    console.log(
      `[FilmSimilarity] High confidence match: "${title}" → "${best.title}" (${(best.similarity * 100).toFixed(0)}%)`
    );
    return { filmId: best.id, confidence: "high" };
  }

  if (best.similarity >= LOW_CONFIDENCE_THRESHOLD) {
    console.log(
      `[FilmSimilarity] Uncertain match: "${title}" vs "${best.title}" (${(best.similarity * 100).toFixed(0)}%) — not matching`
    );
  }

  return null;
}

/** Whether the similarity service is available. Always true: pg_trgm ships with Supabase. */
export function isSimilarityConfigured(): boolean {
  return true;
}
