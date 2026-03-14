/**
 * Audit Wrapper for AutoQuality
 *
 * Bridges the gap between `auditFilmData()` (returns {summary, gaps})
 * and the DQS computation which needs {summary, duplicateCount, dodgyCount}.
 *
 * The two count queries mirror the dodgy detection logic in
 * scripts/audit-and-fix-upcoming.ts and the duplicate detection pass.
 */

import { db } from "@/db";
import { films } from "@/db/schema/films";
import { screenings } from "@/db/schema/screenings";
import { sql, gte, and, eq } from "drizzle-orm";
import { auditFilmData, type AuditSummary } from "@/scripts/audit-film-data";
import { loadThresholds, loadThresholdsAsync } from "./load-thresholds";

export interface AuditForDqs {
  summary: AuditSummary;
  duplicateCount: number;
  dodgyCount: number;
}

/**
 * Run the audit pipeline and return results shaped for DQS computation.
 * Calls `auditFilmData(true)` for upcoming-only metrics, then supplements
 * with duplicate and dodgy count queries.
 * Pre-loads thresholds from DB to pick up AutoQuality's learned improvements.
 */
export async function runAuditForDqs(): Promise<AuditForDqs> {
  // Warm the threshold cache from DB before the dodgy count query uses it
  await loadThresholdsAsync();

  const auditResult = await auditFilmData(true); // upcoming-only
  const [duplicateCount, dodgyCount] = await Promise.all([
    countDuplicateFilms(),
    countDodgyFilms(),
  ]);
  return { summary: auditResult.summary, duplicateCount, dodgyCount };
}

/**
 * Count films sharing the same lower(title) that have upcoming screenings.
 * For each group of N duplicates, counts N-1 as "extras".
 */
async function countDuplicateFilms(): Promise<number> {
  const now = new Date();

  // Find title groups with >1 film that have upcoming screenings.
  // Must use count(DISTINCT films.id) — the inner join fans out per screening.
  const duplicateGroups = await db
    .select({
      lowerTitle: sql<string>`lower(${films.title})`,
      filmCount: sql<number>`count(DISTINCT ${films.id})`.mapWith(Number),
    })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(gte(screenings.datetime, now))
    .groupBy(sql`lower(${films.title})`)
    .having(sql`count(DISTINCT ${films.id}) > 1`);

  // Sum the extras: for each group of N duplicates, N-1 are extras
  return duplicateGroups.reduce((sum, group) => sum + (group.filmCount - 1), 0);
}

/**
 * Count films with upcoming screenings matching dodgy criteria.
 * Mirrors pass7DodgyDetection() logic from scripts/audit-and-fix-upcoming.ts
 * but as a simple count (not a full report).
 *
 * Dodgy criteria (any match counts):
 * - Title longer than maxTitleLength
 * - ALL CAPS title with no TMDB match
 * - Year outside minYear..maxYear
 * - Runtime 0 or > maxRuntime
 * - Missing TMDB + poster + synopsis (triple-missing)
 */
async function countDodgyFilms(): Promise<number> {
  const now = new Date();
  const thresholds = loadThresholds();
  const { maxTitleLength, minYear, maxYear, maxRuntime } =
    thresholds.dodgyDetection;

  // Get distinct films with upcoming screenings (content_type = 'film' only)
  const upcomingFilms = await db
    .selectDistinct({
      id: films.id,
      title: films.title,
      year: films.year,
      runtime: films.runtime,
      tmdbId: films.tmdbId,
      posterUrl: films.posterUrl,
      synopsis: films.synopsis,
    })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(and(eq(films.contentType, "film"), gte(screenings.datetime, now)));

  let dodgyCount = 0;
  for (const film of upcomingFilms) {
    const isDodgy =
      // Long title
      film.title.length > maxTitleLength ||
      // ALL CAPS, no TMDB
      (film.title === film.title.toUpperCase() &&
        film.title.length > 3 &&
        !film.tmdbId) ||
      // Year outlier
      (film.year !== null && (film.year > maxYear || film.year < minYear)) ||
      // Runtime outlier
      (film.runtime !== null &&
        (film.runtime === 0 || film.runtime > maxRuntime)) ||
      // Triple-missing (matches pass7DodgyDetection: !tmdbId && !posterUrl && !synopsis)
      (!film.tmdbId && !film.posterUrl && !film.synopsis);

    if (isDodgy) dodgyCount++;
  }

  return dodgyCount;
}
