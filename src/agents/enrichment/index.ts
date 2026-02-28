/**
 * Intelligent Enrichment Agent
 *
 * This agent improves TMDB matching for difficult cases:
 * 1. Repertory films with variant titles
 * 2. Foreign films with translated titles
 * 3. Films in anthology series or retrospectives
 * 4. Director-focused screenings
 * 5. Event-wrapped titles (e.g., "Saturday Morning Picture Club: Song of the Sea")
 *
 * Uses aggressive auto-fix: automatically applies matches with confidence > 0.8
 */

import { generateTextWithUsage } from "@/lib/gemini";
import { db, schema } from "@/db";
import { eq, isNull, sql } from "drizzle-orm";
import { analyzeTitleAmbiguity, hasSufficientMetadata } from "@/lib/tmdb/ambiguity";
import {
  type TmdbMatchResult,
  type AgentResult,
  AGENT_CONFIGS,
} from "../types";
import { CINEMA_AGENT_SYSTEM_PROMPT, calculateCost } from "../config";
import {
  extractFilmTitle,
  generateSearchVariations,
} from "./title-extractor";

const AGENT_NAME = "enrichment";

// TMDB API configuration
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

/**
 * Check if a film with this TMDB ID already exists
 * Returns the canonical film if found
 */
async function findFilmByTmdbId(tmdbId: number) {
  const [existing] = await db
    .select()
    .from(schema.films)
    .where(eq(schema.films.tmdbId, tmdbId))
    .limit(1);
  return existing;
}

/**
 * Merge a duplicate film into the canonical film
 * - Moves all screenings from duplicate to canonical
 * - Deletes the duplicate film record
 */
async function mergeDuplicateFilm(
  duplicateId: string,
  canonicalId: string,
  duplicateTitle: string,
  canonicalTitle: string
): Promise<{ screeningsMoved: number }> {
  // Move all screenings from duplicate to canonical
  await db
    .update(schema.screenings)
    .set({ filmId: canonicalId })
    .where(eq(schema.screenings.filmId, duplicateId));

  // Get count of affected rows
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.screenings)
    .where(eq(schema.screenings.filmId, canonicalId));

  // Delete the duplicate film
  await db.delete(schema.films).where(eq(schema.films.id, duplicateId));

  console.log(
    `[${AGENT_NAME}] Merged duplicate: "${duplicateTitle}" -> "${canonicalTitle}"`
  );

  return { screeningsMoved: countResult?.count || 0 };
}

/**
 * Search TMDB with multiple strategies
 */
async function searchTmdb(
  title: string,
  options?: {
    year?: number;
    language?: string;
  }
): Promise<
  Array<{
    id: number;
    title: string;
    release_date: string;
    overview: string;
  }>
> {
  if (!TMDB_API_KEY) {
    console.warn("TMDB_API_KEY not set");
    return [];
  }

  const params = new URLSearchParams({
    api_key: TMDB_API_KEY,
    query: title,
    include_adult: "false",
  });

  if (options?.year) {
    params.set("year", options.year.toString());
  }
  if (options?.language) {
    params.set("language", options.language);
  }

  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/search/movie?${params.toString()}`
    );
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error("TMDB search failed:", error);
    return [];
  }
}

/**
 * Find and enrich films without TMDB matches
 */
export async function enrichUnmatchedFilms(
  limit = 20
): Promise<AgentResult<TmdbMatchResult[]>> {
  const startTime = Date.now();
  const config = AGENT_CONFIGS.enrichment;
  const results: TmdbMatchResult[] = [];
  let totalTokens = 0;

  try {
    // Find films without TMDB ID
    const unmatchedFilms = await db
      .select()
      .from(schema.films)
      .where(isNull(schema.films.tmdbId))
      .limit(limit);

    if (unmatchedFilms.length === 0) {
      return {
        success: true,
        data: [],
        tokensUsed: 0,
        executionTimeMs: Date.now() - startTime,
        agentName: AGENT_NAME,
        timestamp: new Date(),
      };
    }

    console.log(
      `[${AGENT_NAME}] Processing ${unmatchedFilms.length} unmatched films`
    );

    for (const film of unmatchedFilms) {
      // Step 1: Extract the underlying film title from event wrappers
      const extraction = extractFilmTitle(film.title);
      const searchVariations = generateSearchVariations(film.title);

      // Log extraction info
      if (extraction.extractionMethod !== "none") {
        console.log(
          `[${AGENT_NAME}] Extracted: "${film.title}" -> "${extraction.extractedTitle}" (${extraction.extractionMethod})`
        );
      }

      // Skip low-confidence compilations (festival compilations, etc.)
      if (extraction.isCompilation && extraction.confidence < 0.5) {
        console.log(
          `[${AGENT_NAME}] Skipping compilation: "${film.title}"`
        );
        continue;
      }

      // Step 2: Try TMDB search with extracted title variations
      let tmdbResults: Array<{
        id: number;
        title: string;
        release_date: string;
        overview: string;
      }> = [];

      for (const searchTitle of searchVariations) {
        tmdbResults = await searchTmdb(searchTitle, {
          year: film.year ?? undefined,
        });
        if (tmdbResults.length > 0) break;

        // Try without year if we have one
        if (film.year) {
          tmdbResults = await searchTmdb(searchTitle);
          if (tmdbResults.length > 0) break;
        }
      }

      // Step 3: If still no results, use agent to suggest alternative searches
      if (tmdbResults.length === 0) {
        const extractionContext = extraction.extractionMethod !== "none"
          ? `\nExtracted title: "${extraction.extractedTitle}" (from ${extraction.extractionMethod})`
          : "";
        const broadcastNote = extraction.isLiveBroadcast
          ? "\nNote: This appears to be a live broadcast (NT Live, Met Opera, etc.)"
          : "";

        const prompt = `I need to find the TMDB entry for this film:

Title: "${film.title}"${extractionContext}${broadcastNote}
Year: ${film.year || "unknown"}
Directors: ${film.directors?.join(", ") || "unknown"}

I already tried these search variations: ${searchVariations.slice(0, 3).map(t => `"${t}"`).join(", ")}

The direct TMDB search returned no results. Suggest alternative search strategies:
1. What variations of the title might exist? (original language, alternate titles)
2. Could this be part of a series or anthology?
3. Is there a common misspelling or variant?

Respond with JSON:
{
  "alternativeTitles": ["list of titles to try"],
  "possibleYear": number or null,
  "notes": "brief explanation"
}`;

        // Run direct API call for alternative search
        const response = await generateTextWithUsage(prompt, {
          systemPrompt: CINEMA_AGENT_SYSTEM_PROMPT,
        });

        totalTokens += response.tokensUsed;

        try {
          const responseText = response.text;

          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            // Try each alternative title
            for (const altTitle of parsed.alternativeTitles || []) {
              const altResults = await searchTmdb(altTitle, {
                year: parsed.possibleYear || film.year || undefined,
              });
              if (altResults.length > 0) {
                tmdbResults = altResults;
                break;
              }
            }
          }
        } catch (parseError) {
          console.error("Failed to parse agent response:", parseError);
        }
      }

      // If we have results, ask agent to pick the best match
      if (tmdbResults.length > 0) {
        const topResults = tmdbResults.slice(0, 5);
        const extractedNote = extraction.extractionMethod !== "none"
          ? `\n- Extracted title: "${extraction.extractedTitle}"`
          : "";

        const matchPrompt = `Match this film to the best TMDB result:

Our film:
- Title: "${film.title}"${extractedNote}
- Year: ${film.year || "unknown"}
- Directors: ${film.directors?.join(", ") || "unknown"}

TMDB candidates:
${topResults
  .map(
    (r, i) => `${i + 1}. ID: ${r.id}
   Title: "${r.title}"
   Year: ${r.release_date?.slice(0, 4) || "unknown"}
   Overview: ${r.overview?.slice(0, 100)}...`
  )
  .join("\n\n")}

Which is the best match? Consider:
- Title similarity (the extracted title should match the TMDB title)
- Year match (within 1 year is acceptable)
- Overview relevance
- If this is an event-wrapped title, match the underlying film not the event

Respond with JSON:
{
  "bestMatchIndex": 1-5 or 0 if none match,
  "confidence": 0-1,
  "reasoning": "brief explanation"
}`;

        // Run direct API call for matching
        const matchResponse = await generateTextWithUsage(matchPrompt, {
          systemPrompt: CINEMA_AGENT_SYSTEM_PROMPT,
        });

        totalTokens += matchResponse.tokensUsed;

        try {
          const responseText = matchResponse.text;

          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            if (parsed.bestMatchIndex > 0 && parsed.confidence > 0) {
              const bestMatch = topResults[parsed.bestMatchIndex - 1];

              // Determine match strategy based on extraction
              let matchStrategy: "exact" | "fuzzy" | "extracted" | "agent" = "fuzzy";
              if (parsed.confidence > 0.9) {
                matchStrategy = "exact";
              } else if (extraction.extractionMethod !== "none") {
                matchStrategy = "extracted";
              }

              const matchResult: TmdbMatchResult = {
                filmId: film.id,
                originalTitle: film.title,
                tmdbId: bestMatch.id,
                matchedTitle: bestMatch.title,
                confidence: parsed.confidence,
                matchStrategy,
                shouldAutoApply:
                  parsed.confidence >= config.confidenceThreshold,
              };

              results.push(matchResult);

              // Auto-apply if confidence is high enough
              if (
                matchResult.shouldAutoApply &&
                config.enableAutoFix
              ) {
                // Check ambiguity - for ambiguous titles, require higher confidence or metadata
                const ambiguity = analyzeTitleAmbiguity(film.title);
                const hasYear = !!film.year;
                const hasDirector = film.directors && film.directors.length > 0;
                const hasMetadata = hasSufficientMetadata(film.title, hasYear, hasDirector);

                // For ambiguous titles without sufficient metadata, require 90% confidence
                const requiredConfidence = ambiguity.requiresReview && !hasMetadata ? 0.9 : 0.8;

                if (parsed.confidence < requiredConfidence) {
                  console.log(
                    `[${AGENT_NAME}] Skipping ambiguous title "${film.title}" ` +
                      `(${(parsed.confidence * 100).toFixed(0)}% < ${(requiredConfidence * 100).toFixed(0)}% required, ` +
                      `reasons: ${ambiguity.reasons.join(", ")})`
                  );
                  // Record that we skipped this for review
                  await db
                    .update(schema.films)
                    .set({
                      matchStrategy: "needs-review",
                      matchConfidence: parsed.confidence,
                      matchedAt: new Date(),
                      updatedAt: new Date(),
                    })
                    .where(eq(schema.films.id, film.id));
                  continue;
                }

                // Determine the match strategy for tracking
                let dbMatchStrategy = "auto-no-hints";
                if (hasYear && hasDirector) {
                  dbMatchStrategy = "auto-with-both";
                } else if (hasYear) {
                  dbMatchStrategy = "auto-with-year";
                } else if (hasDirector) {
                  dbMatchStrategy = "auto-with-director";
                }

                // Check if another film already has this TMDB ID
                const existingFilm = await findFilmByTmdbId(bestMatch.id);

                if (existingFilm) {
                  // This is a duplicate - merge into the canonical film
                  console.log(
                    `[${AGENT_NAME}] Duplicate detected: "${film.title}" -> merging with "${existingFilm.title}" (TMDB ${bestMatch.id})`
                  );
                  await mergeDuplicateFilm(
                    film.id,
                    existingFilm.id,
                    film.title,
                    existingFilm.title
                  );
                  matchResult.matchStrategy = "extracted"; // Mark as deduplicated
                } else {
                  // No existing film - safe to update
                  console.log(
                    `[${AGENT_NAME}] Auto-applying TMDB match: "${film.title}" -> ${bestMatch.id} (${(parsed.confidence * 100).toFixed(0)}%)`
                  );

                  await db
                    .update(schema.films)
                    .set({
                      tmdbId: bestMatch.id,
                      matchConfidence: parsed.confidence,
                      matchStrategy: dbMatchStrategy,
                      matchedAt: new Date(),
                      updatedAt: new Date(),
                    })
                    .where(eq(schema.films.id, film.id));
                }
              }
            }
          }
        } catch (parseError) {
          console.error("Failed to parse match response:", parseError);
        }
      }

      // Rate limit to avoid overwhelming TMDB API
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const cost = calculateCost(
      config.model,
      totalTokens * 0.7,
      totalTokens * 0.3
    );

    const autoApplied = results.filter((r) => r.shouldAutoApply).length;
    console.log(
      `[${AGENT_NAME}] Found ${results.length} matches, auto-applied ${autoApplied}, cost: $${cost.estimatedCostUsd}`
    );

    return {
      success: true,
      data: results,
      tokensUsed: totalTokens,
      executionTimeMs: Date.now() - startTime,
      agentName: AGENT_NAME,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      tokensUsed: totalTokens,
      executionTimeMs: Date.now() - startTime,
      agentName: AGENT_NAME,
      timestamp: new Date(),
    };
  }
}

/**
 * Re-attempt enrichment for films with low-confidence matches
 */
export async function improveWeakMatches(
  confidenceThreshold = 0.7,
  limit = 10
): Promise<AgentResult<TmdbMatchResult[]>> {
  // This would query films with TMDB IDs but low match confidence
  // and try to find better matches or validate existing ones
  // For now, delegate to the main enrichment function
  // TODO: Use confidenceThreshold to filter films for re-enrichment
  void confidenceThreshold;
  return enrichUnmatchedFilms(limit);
}
