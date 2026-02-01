/**
 * Fallback Enrichment Agent
 *
 * Enriches films that failed TMDB matching using:
 * 1. Claude Haiku web knowledge extraction
 * 2. Booking page OG/meta scraping
 * 3. Letterboxd discovery
 *
 * Films are processed in priority order (soonest upcoming screenings first).
 * High-confidence results (>0.8) are auto-applied; low-confidence queued for review.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { films } from "@/db/schema/films";
import { eq, sql } from "drizzle-orm";
import { searchAndExtractFilmData } from "./web-search";
import {
  scrapeBookingPage,
  extractFilmDataFromBookingPage,
} from "./booking-page-scraper";
import { calculateConfidence } from "./confidence";
import { fetchLetterboxdRating } from "./letterboxd";
import type { AgentResult } from "../types";

export interface FallbackEnrichmentOptions {
  /** Max films to process */
  limit?: number;
  /** Whether to auto-apply high-confidence results to DB */
  autoApply?: boolean;
  /** Minimum confidence to auto-apply (default: 0.8) */
  confidenceThreshold?: number;
}

export interface FallbackEnrichmentResult {
  processed: number;
  autoApplied: number;
  needsReview: number;
  skipped: number;
  details: string[];
}

/**
 * Run fallback enrichment on films missing data
 */
export async function runFallbackEnrichment(
  options: FallbackEnrichmentOptions = {}
): Promise<AgentResult<FallbackEnrichmentResult>> {
  const {
    limit = 20,
    autoApply = true,
    confidenceThreshold = 0.8,
  } = options;

  const startTime = Date.now();
  let totalTokens = 0;

  console.log("\n=== Fallback Film Enrichment ===\n");
  console.log(`Processing up to ${limit} films`);
  console.log(`Auto-apply: ${autoApply} (threshold: ${confidenceThreshold})`);

  try {
    const client = new Anthropic();

    // Get films needing enrichment, prioritized by upcoming screenings
    const filmsToProcess = await getFilmsNeedingEnrichment(limit);

    if (filmsToProcess.length === 0) {
      console.log("\nNo films need fallback enrichment.");
      return {
        success: true,
        data: {
          processed: 0,
          autoApplied: 0,
          needsReview: 0,
          skipped: 0,
          details: ["No films need fallback enrichment"],
        },
        tokensUsed: 0,
        executionTimeMs: Date.now() - startTime,
        agentName: "fallback-enrichment",
        timestamp: new Date(),
      };
    }

    console.log(`\nFound ${filmsToProcess.length} films to process\n`);

    let autoApplied = 0;
    let needsReview = 0;
    let skipped = 0;
    const details: string[] = [];

    for (const film of filmsToProcess) {
      console.log(`Processing: "${film.title}" (${film.year || "unknown year"})`);

      // Step 1: AI-powered web knowledge extraction
      const { data: webData, tokensUsed } = await searchAndExtractFilmData(
        {
          title: film.title,
          year: film.year,
          cinemaName: film.cinemaName || undefined,
          bookingUrl: film.bookingUrl || undefined,
        },
        client
      );
      totalTokens += tokensUsed;

      if (!webData) {
        console.log(`  → No data found, skipping`);
        skipped++;
        details.push(`⊘ "${film.title}" — no data found`);
        continue;
      }

      // Step 2: Supplement with booking page data if available
      let bookingData: {
        posterUrl?: string;
        synopsis?: string;
        title?: string;
      } = {};
      if (film.bookingUrl) {
        const pageData = await scrapeBookingPage(film.bookingUrl);
        if (pageData) {
          bookingData = extractFilmDataFromBookingPage(pageData);
        }
      }

      // Step 3: Try Letterboxd if not already found by AI
      if (!webData.letterboxdRating && webData.title) {
        const lbResult = await fetchLetterboxdRating(
          webData.title,
          webData.year
        );
        if (lbResult) {
          webData.letterboxdUrl = lbResult.url;
          webData.letterboxdRating = lbResult.rating;
        }
      }

      // Step 4: Merge data (web search preferred, booking page as fallback)
      const mergedPosterUrl = webData.posterUrl || bookingData.posterUrl || null;
      const mergedSynopsis = webData.synopsis || bookingData.synopsis || null;

      // Step 5: Calculate confidence
      const confidence = calculateConfidence({
        originalTitle: film.title,
        originalYear: film.year,
        extractedTitle: webData.title,
        extractedYear: webData.year,
        sourceCount: webData.sourceCount,
        hasPoster: !!mergedPosterUrl,
        hasSynopsis: !!mergedSynopsis,
        hasLetterboxd: !!webData.letterboxdRating,
        hasImdb: !!webData.imdbId,
      });

      const pctStr = `${(confidence.score * 100).toFixed(0)}%`;

      // Step 6: Apply or queue
      if (autoApply && confidence.shouldAutoApply) {
        await applyEnrichmentToFilm(film.id, {
          ...webData,
          posterUrl: mergedPosterUrl,
          synopsis: mergedSynopsis,
        });
        autoApplied++;
        console.log(`  → Auto-applied (${pctStr} confidence)`);
        details.push(
          `✓ "${film.title}" — enriched (${pctStr}): ${describeChanges(webData, mergedPosterUrl, mergedSynopsis)}`
        );
      } else {
        needsReview++;
        console.log(
          `  → Needs review (${pctStr} confidence, threshold: ${confidenceThreshold})`
        );
        details.push(
          `? "${film.title}" — needs review (${pctStr}): ${describeChanges(webData, mergedPosterUrl, mergedSynopsis)}`
        );
      }

      // Rate limit: 300ms between films to avoid API rate limits
      await new Promise((r) => setTimeout(r, 300));
    }

    const result: FallbackEnrichmentResult = {
      processed: filmsToProcess.length,
      autoApplied,
      needsReview,
      skipped,
      details,
    };

    console.log("\n=== Fallback Enrichment Complete ===");
    console.log(
      `Processed: ${result.processed}, Auto-applied: ${autoApplied}, Needs review: ${needsReview}, Skipped: ${skipped}`
    );
    console.log(`Tokens used: ${totalTokens}`);

    return {
      success: true,
      data: result,
      tokensUsed: totalTokens,
      executionTimeMs: Date.now() - startTime,
      agentName: "fallback-enrichment",
      timestamp: new Date(),
    };
  } catch (error) {
    console.error("Fallback enrichment failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      tokensUsed: totalTokens,
      executionTimeMs: Date.now() - startTime,
      agentName: "fallback-enrichment",
      timestamp: new Date(),
    };
  }
}

/**
 * Get films that need fallback enrichment, ordered by upcoming screening count
 */
async function getFilmsNeedingEnrichment(
  limit: number
): Promise<
  Array<{
    id: string;
    title: string;
    year: number | null;
    cinemaName: string | null;
    bookingUrl: string | null;
  }>
> {
  const now = new Date();

  // Films without TMDB match that are missing key data and have upcoming screenings
  const results = await db.execute(sql`
    SELECT
      f.id,
      f.title,
      f.year,
      c.name as cinema_name,
      s.booking_url,
      COUNT(s.id) as upcoming_count
    FROM films f
    INNER JOIN screenings s ON s.film_id = f.id AND s.datetime >= ${now.toISOString()}
    INNER JOIN cinemas c ON c.id = s.cinema_id
    WHERE f.tmdb_id IS NULL
      AND f.content_type = 'film'
      AND (f.match_strategy IS NULL OR f.match_strategy != 'web-search-agent')
      AND (
        f.poster_url IS NULL
        OR f.synopsis IS NULL
        OR f.poster_url = ''
        OR f.synopsis = ''
      )
    GROUP BY f.id, f.title, f.year, c.name, s.booking_url
    ORDER BY upcoming_count DESC, f.created_at DESC
    LIMIT ${limit}
  `);

  // Cast results to our expected type (postgres-js returns array directly)
  const rows = results as unknown as Array<{
    id: string;
    title: string;
    year: number | null;
    cinema_name: string | null;
    booking_url: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    year: r.year,
    cinemaName: r.cinema_name,
    bookingUrl: r.booking_url,
  }));
}

/**
 * Apply enrichment data to a film in the database
 */
async function applyEnrichmentToFilm(
  filmId: string,
  data: {
    title?: string;
    originalTitle?: string;
    year: number | null;
    directors: string[];
    cast: Array<{ name: string; character?: string; order: number }>;
    genres: string[];
    runtime: number | null;
    certification: string | null;
    synopsis: string | null;
    posterUrl: string | null;
    imdbId: string | null;
    letterboxdUrl: string | null;
    letterboxdRating: number | null;
    countries: string[];
    languages: string[];
  }
): Promise<void> {
  // Only update fields that are currently null/empty
  // Never overwrite existing data
  const currentFilm = await db
    .select()
    .from(films)
    .where(eq(films.id, filmId))
    .limit(1);

  if (currentFilm.length === 0) return;

  const existing = currentFilm[0];
  const updates: Record<string, unknown> = {};

  if (!existing.year && data.year) updates.year = data.year;
  if (!existing.synopsis && data.synopsis) updates.synopsis = data.synopsis;
  if (!existing.posterUrl && data.posterUrl) updates.posterUrl = data.posterUrl;
  if (!existing.runtime && data.runtime) updates.runtime = data.runtime;
  if (!existing.certification && data.certification)
    updates.certification = data.certification;
  if (!existing.imdbId && data.imdbId) updates.imdbId = data.imdbId;
  if (!existing.letterboxdUrl && data.letterboxdUrl)
    updates.letterboxdUrl = data.letterboxdUrl;
  if (existing.letterboxdRating == null && data.letterboxdRating != null)
    updates.letterboxdRating = data.letterboxdRating;
  if ((!existing.directors || existing.directors.length === 0) && data.directors.length > 0)
    updates.directors = data.directors;
  if ((!existing.cast || existing.cast.length === 0) && data.cast.length > 0)
    updates.cast = data.cast;
  if ((!existing.genres || existing.genres.length === 0) && data.genres.length > 0)
    updates.genres = data.genres;
  if ((!existing.countries || existing.countries.length === 0) && data.countries.length > 0)
    updates.countries = data.countries;
  if ((!existing.languages || existing.languages.length === 0) && data.languages.length > 0)
    updates.languages = data.languages;
  if (data.originalTitle && !existing.originalTitle)
    updates.originalTitle = data.originalTitle;

  // Always update match tracking
  updates.matchStrategy = "web-search-agent";
  updates.matchedAt = new Date();
  updates.updatedAt = new Date();

  if (Object.keys(updates).length > 2) {
    // More than just matchStrategy + matchedAt
    await db.update(films).set(updates).where(eq(films.id, filmId));
  }
}

/**
 * Describe what data was found for logging
 */
function describeChanges(
  data: { synopsis: string | null; directors: string[]; letterboxdRating: number | null; imdbId: string | null },
  posterUrl: string | null,
  synopsis: string | null
): string {
  const parts: string[] = [];
  if (posterUrl) parts.push("poster");
  if (synopsis || data.synopsis) parts.push("synopsis");
  if (data.directors.length > 0) parts.push("directors");
  if (data.letterboxdRating) parts.push(`LB:${data.letterboxdRating}`);
  if (data.imdbId) parts.push("IMDb");
  return parts.length > 0 ? parts.join(", ") : "minimal data";
}

// Re-export for external use
export { calculateConfidence, titleSimilarity } from "./confidence";
export type { ConfidenceInput, ConfidenceResult } from "./confidence";
