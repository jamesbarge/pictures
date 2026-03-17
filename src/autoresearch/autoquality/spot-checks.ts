/**
 * User-Facing Spot Checks
 *
 * Validates that DQS improvements are real by checking things NOT in the DQS
 * formula. This is the "don't trust the loss" layer — if DQS goes up but
 * spot-checks show problems, we catch it early.
 *
 * Spot-check results are included in the Telegram overnight report.
 */

import { db, isDatabaseAvailable } from "@/db";
import { films } from "@/db/schema/films";
import { screenings } from "@/db/schema/screenings";
import { sql, gte, eq, and, isNull, isNotNull, lte } from "drizzle-orm";

interface SpotCheckResults {
  /** Films with upcoming screenings but no poster (user-visible gap) */
  filmsWithNoPoster: number;
  /** Films with TMDB match but low confidence (potential wrong match) */
  lowConfidenceMatches: number;
  /** Films with upcoming screenings in the next 7 days (homepage pool) */
  homepageFilmCount: number;
  /** Percentage of homepage films with complete metadata (poster + synopsis) */
  homepageMetadataComplete: number;
}

/**
 * Run spot-check queries that validate DQS improvements are user-visible.
 * These metrics are intentionally NOT in the DQS formula to act as independent validation.
 */
export async function runSpotChecks(): Promise<SpotCheckResults | null> {
  if (!isDatabaseAvailable) return null;

  try {
    const now = new Date();
    const oneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [noPoster, lowConfidence, homepage] = await Promise.all([
      // Films with upcoming screenings but no poster
      countFilmsNoPoster(now),
      // Films with TMDB match but low confidence (potential wrong matches)
      countLowConfidenceMatches(now),
      // Homepage film pool analysis (next 7 days)
      analyzeHomepagePool(now, oneWeek),
    ]);

    return {
      filmsWithNoPoster: noPoster,
      lowConfidenceMatches: lowConfidence,
      homepageFilmCount: homepage.total,
      homepageMetadataComplete: homepage.completePercent,
    };
  } catch (err) {
    console.error("[spot-checks] Failed to run spot checks:", err);
    return null;
  }
}

async function countFilmsNoPoster(now: Date): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(DISTINCT ${films.id})`.mapWith(Number) })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(
      and(
        eq(films.contentType, "film"),
        gte(screenings.datetime, now),
        isNull(films.posterUrl)
      )
    );

  return result[0]?.count ?? 0;
}

async function countLowConfidenceMatches(now: Date): Promise<number> {
  // Films with a TMDB ID but low match confidence (< 0.7).
  // These are the matches most likely to be wrong — if AutoQuality
  // lowers the confidence threshold, more of these appear.
  const result = await db
    .select({ count: sql<number>`count(DISTINCT ${films.id})`.mapWith(Number) })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(
      and(
        eq(films.contentType, "film"),
        gte(screenings.datetime, now),
        isNotNull(films.tmdbId),
        isNotNull(films.matchConfidence),
        lte(films.matchConfidence, 0.7)
      )
    );

  return result[0]?.count ?? 0;
}

async function analyzeHomepagePool(
  now: Date,
  oneWeek: Date
): Promise<{ total: number; completePercent: number }> {
  // Films with screenings in the next 7 days = the "homepage pool"
  const homepageFilms = await db
    .selectDistinct({
      id: films.id,
      posterUrl: films.posterUrl,
      synopsis: films.synopsis,
    })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(
      and(
        eq(films.contentType, "film"),
        gte(screenings.datetime, now),
        sql`${screenings.datetime} < ${oneWeek.toISOString()}::timestamptz`
      )
    );

  const total = homepageFilms.length;
  if (total === 0) return { total: 0, completePercent: 100 };

  const complete = homepageFilms.filter((f) => f.posterUrl && f.synopsis).length;
  const completePercent = (complete / total) * 100;

  return { total, completePercent };
}

/**
 * Format spot-check results for the Telegram overnight report.
 */
export function formatSpotChecks(results: SpotCheckResults): string[] {
  return [
    "SPOT CHECKS (independent validation):",
    `  No poster: ${results.filmsWithNoPoster} films`,
    `  Low-confidence TMDB: ${results.lowConfidenceMatches} films`,
    `  Homepage pool (7d): ${results.homepageFilmCount} films, ${results.homepageMetadataComplete.toFixed(0)}% complete metadata`,
  ];
}
