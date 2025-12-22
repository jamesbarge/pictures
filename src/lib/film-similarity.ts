/**
 * Film Similarity Service
 *
 * Uses PostgreSQL trigram similarity (pg_trgm) for fuzzy matching,
 * with optional Claude confirmation for uncertain matches.
 *
 * This catches fuzzy matches like:
 * - "Blade Runner 2049" vs "BLADE RUNNER 2049 (4K Restoration)"
 * - "The Godfather" vs "Godfather, The"
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { sql } from "drizzle-orm";

// Initialize Anthropic client (uses ANTHROPIC_API_KEY from env)
const anthropic = new Anthropic();

// Similarity thresholds for trigram matching
const HIGH_CONFIDENCE_THRESHOLD = 0.7; // Auto-accept match
const LOW_CONFIDENCE_THRESHOLD = 0.4; // Consider for Claude confirmation
const MINIMUM_THRESHOLD = 0.3; // Below this, don't even consider

interface SimilarFilm {
  id: string;
  title: string;
  year: number | null;
  tmdbId: number | null;
  similarity: number;
}

/**
 * Find films similar to the given title using trigram similarity
 * Uses PostgreSQL's pg_trgm extension for efficient fuzzy matching
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

  // Cast results to our expected type
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
 * Use Claude to confirm if two film titles refer to the same film
 * Returns confidence score 0-1
 */
export async function confirmFilmMatchWithClaude(
  title1: string,
  year1: number | null,
  title2: string,
  year2: number | null
): Promise<{ isMatch: boolean; confidence: number; reasoning: string }> {
  const prompt = `You are a film database expert. Determine if these two entries refer to the SAME film:

Entry 1: "${title1}"${year1 ? ` (${year1})` : ""}
Entry 2: "${title2}"${year2 ? ` (${year2})` : ""}

Consider:
- Different formatting of the same title (e.g., "The Godfather" vs "Godfather, The")
- Special screening editions (e.g., "Blade Runner 2049" vs "Blade Runner 2049 (4K Restoration)")
- BUT be careful about remakes, sequels, or different films with similar titles

Respond with JSON only:
{"isMatch": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation"}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-latest",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const json = JSON.parse(text);

    return {
      isMatch: json.isMatch === true,
      confidence: typeof json.confidence === "number" ? json.confidence : 0.5,
      reasoning: json.reasoning || "",
    };
  } catch (e) {
    console.warn("[FilmSimilarity] Claude confirmation failed:", e);
    // Default to no match on error
    return { isMatch: false, confidence: 0, reasoning: "API error" };
  }
}

/**
 * Find a matching film for the given title, using trigram similarity
 * and optional Claude confirmation for uncertain matches
 *
 * @param title - The film title to search for
 * @param year - Optional year for disambiguation
 * @param useClaude - Whether to use Claude for uncertain matches (default: false)
 * @returns The best matching film ID, or null if no confident match
 */
export async function findMatchingFilm(
  title: string,
  year?: number | null,
  useClaude: boolean = false
): Promise<{ filmId: string; confidence: "high" | "medium" | "low" } | null> {
  const similar = await findSimilarFilmsByTitle(title, 5, MINIMUM_THRESHOLD);

  if (similar.length === 0) {
    return null;
  }

  const best = similar[0];

  // High confidence - trigram similarity is very high
  if (best.similarity >= HIGH_CONFIDENCE_THRESHOLD) {
    console.log(
      `[FilmSimilarity] High confidence match: "${title}" → "${best.title}" (${(best.similarity * 100).toFixed(0)}%)`
    );
    return { filmId: best.id, confidence: "high" };
  }

  // Medium confidence - use Claude to confirm if enabled
  if (best.similarity >= LOW_CONFIDENCE_THRESHOLD && useClaude) {
    console.log(
      `[FilmSimilarity] Checking with Claude: "${title}" vs "${best.title}" (${(best.similarity * 100).toFixed(0)}%)`
    );

    const confirmation = await confirmFilmMatchWithClaude(title, year ?? null, best.title, best.year);

    if (confirmation.isMatch && confirmation.confidence >= 0.7) {
      console.log(
        `[FilmSimilarity] Claude confirmed match: ${confirmation.reasoning}`
      );
      return { filmId: best.id, confidence: "medium" };
    } else {
      console.log(
        `[FilmSimilarity] Claude rejected match: ${confirmation.reasoning}`
      );
    }
  }

  // Low confidence or no Claude - don't match
  if (best.similarity >= LOW_CONFIDENCE_THRESHOLD) {
    console.log(
      `[FilmSimilarity] Uncertain match (no Claude): "${title}" vs "${best.title}" (${(best.similarity * 100).toFixed(0)}%)`
    );
  }

  return null;
}

/**
 * Check if similarity service is available
 * (Always true now since we use pg_trgm which doesn't need external API)
 */
export function isSimilarityConfigured(): boolean {
  return true; // pg_trgm is always available in Neon
}

/**
 * Check if Claude confirmation is available
 */
export function isClaudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
