#!/usr/bin/env npx tsx
/**
 * Film Data Quality Audit Script
 *
 * Queries the database and reports on films missing key metadata.
 * Outputs structured JSON + formatted terminal table.
 * Same data feeds the /admin/data-quality dashboard page.
 *
 * Usage:
 *   npx tsx -r tsconfig-paths/register src/scripts/audit-film-data.ts
 *   npx tsx -r tsconfig-paths/register src/scripts/audit-film-data.ts --json
 *   npx tsx -r tsconfig-paths/register src/scripts/audit-film-data.ts --upcoming-only
 */

import { db } from "@/db";
import { films } from "@/db/schema/films";
import { screenings } from "@/db/schema/screenings";
import { sql, eq, isNull, gte, and, or, count } from "drizzle-orm";

export interface FilmDataGap {
  id: string;
  title: string;
  year: number | null;
  missingFields: string[];
  hasUpcomingScreenings: boolean;
  upcomingScreeningCount: number;
  matchStrategy: string | null;
  tmdbId: number | null;
  createdAt: Date;
}

export interface AuditSummary {
  totalFilms: number;
  filmsWithUpcoming: number;
  missingPoster: number;
  missingSynopsis: number;
  missingLetterboxdRating: number;
  missingTmdbId: number;
  missingYear: number;
  missingDirectors: number;
  missingGenres: number;
  missingRuntime: number;
  /** Films missing poster that have upcoming screenings */
  missingPosterUpcoming: number;
  missingSynopsisUpcoming: number;
  missingLetterboxdRatingUpcoming: number;
  missingTmdbIdUpcoming: number;
}

export interface AuditResult {
  summary: AuditSummary;
  gaps: FilmDataGap[];
  generatedAt: string;
}

/**
 * Run the data quality audit
 * @param upcomingOnly - Only include films with upcoming screenings
 * @param limit - Max number of gap records to return (default 200)
 */
export async function auditFilmData(
  upcomingOnly = false,
  limit = 200
): Promise<AuditResult> {
  const now = new Date();

  // Get total film counts
  const [totalResult] = await db.select({ count: count() }).from(films);
  const totalFilms = totalResult.count;

  // Get films with upcoming screenings
  const filmsWithUpcomingQuery = db
    .selectDistinct({ filmId: screenings.filmId })
    .from(screenings)
    .where(gte(screenings.datetime, now));

  const filmsWithUpcoming = await filmsWithUpcomingQuery;
  const upcomingFilmIds = new Set(filmsWithUpcoming.map((r) => r.filmId));

  // Count missing fields (all films)
  const [missingPoster] = await db
    .select({ count: count() })
    .from(films)
    .where(or(isNull(films.posterUrl), eq(films.posterUrl, "")));

  const [missingSynopsis] = await db
    .select({ count: count() })
    .from(films)
    .where(or(isNull(films.synopsis), eq(films.synopsis, "")));

  const [missingLetterboxd] = await db
    .select({ count: count() })
    .from(films)
    .where(isNull(films.letterboxdRating));

  const [missingTmdb] = await db
    .select({ count: count() })
    .from(films)
    .where(isNull(films.tmdbId));

  const [missingYear] = await db
    .select({ count: count() })
    .from(films)
    .where(isNull(films.year));

  const [missingDirectors] = await db
    .select({ count: count() })
    .from(films)
    .where(
      or(
        isNull(films.directors),
        sql`${films.directors} = '{}'`
      )
    );

  const [missingGenres] = await db
    .select({ count: count() })
    .from(films)
    .where(
      or(
        isNull(films.genres),
        sql`${films.genres} = '{}'`
      )
    );

  const [missingRuntime] = await db
    .select({ count: count() })
    .from(films)
    .where(isNull(films.runtime));

  // Count missing fields for upcoming films only
  // Use subquery for upcoming film IDs
  const upcomingSubquery = db
    .selectDistinct({ filmId: screenings.filmId })
    .from(screenings)
    .where(gte(screenings.datetime, now));

  const [missingPosterUpcoming] = await db
    .select({ count: count() })
    .from(films)
    .where(
      and(
        or(isNull(films.posterUrl), eq(films.posterUrl, "")),
        sql`${films.id} IN (${upcomingSubquery})`
      )
    );

  const [missingSynopsisUpcoming] = await db
    .select({ count: count() })
    .from(films)
    .where(
      and(
        or(isNull(films.synopsis), eq(films.synopsis, "")),
        sql`${films.id} IN (${upcomingSubquery})`
      )
    );

  const [missingLetterboxdUpcoming] = await db
    .select({ count: count() })
    .from(films)
    .where(
      and(
        isNull(films.letterboxdRating),
        sql`${films.id} IN (${upcomingSubquery})`
      )
    );

  const [missingTmdbUpcoming] = await db
    .select({ count: count() })
    .from(films)
    .where(
      and(
        isNull(films.tmdbId),
        sql`${films.id} IN (${upcomingSubquery})`
      )
    );

  // Build gaps list: films with any missing data
  const gapFilms = await db
    .select({
      id: films.id,
      title: films.title,
      year: films.year,
      posterUrl: films.posterUrl,
      synopsis: films.synopsis,
      letterboxdRating: films.letterboxdRating,
      tmdbId: films.tmdbId,
      directors: films.directors,
      genres: films.genres,
      runtime: films.runtime,
      matchStrategy: films.matchStrategy,
      createdAt: films.createdAt,
    })
    .from(films)
    .where(
      or(
        isNull(films.tmdbId),
        isNull(films.posterUrl),
        eq(films.posterUrl, ""),
        isNull(films.synopsis),
        eq(films.synopsis, ""),
        isNull(films.letterboxdRating),
        isNull(films.year),
        isNull(films.runtime),
        sql`${films.directors} = '{}'`,
        sql`${films.genres} = '{}'`
      )
    )
    .orderBy(films.title)
    .limit(limit * 2); // Fetch extra to filter

  // For each gap film, count upcoming screenings
  const upcomingCounts = await db
    .select({
      filmId: screenings.filmId,
      count: count(),
    })
    .from(screenings)
    .where(gte(screenings.datetime, now))
    .groupBy(screenings.filmId);

  const upcomingCountMap = new Map(
    upcomingCounts.map((r) => [r.filmId, r.count])
  );

  let gaps: FilmDataGap[] = gapFilms.map((film) => {
    const missing: string[] = [];
    if (!film.tmdbId) missing.push("tmdbId");
    if (!film.posterUrl) missing.push("posterUrl");
    if (!film.synopsis) missing.push("synopsis");
    if (film.letterboxdRating == null) missing.push("letterboxdRating");
    if (film.year == null) missing.push("year");
    if (film.runtime == null) missing.push("runtime");
    if (!film.directors || film.directors.length === 0) missing.push("directors");
    if (!film.genres || film.genres.length === 0) missing.push("genres");

    const upcomingCount = upcomingCountMap.get(film.id) || 0;

    return {
      id: film.id,
      title: film.title,
      year: film.year,
      missingFields: missing,
      hasUpcomingScreenings: upcomingCount > 0,
      upcomingScreeningCount: upcomingCount,
      matchStrategy: film.matchStrategy,
      tmdbId: film.tmdbId,
      createdAt: film.createdAt,
    };
  });

  // Filter to upcoming only if requested
  if (upcomingOnly) {
    gaps = gaps.filter((g) => g.hasUpcomingScreenings);
  }

  // Sort: upcoming screenings first (desc), then by missing field count (desc)
  gaps.sort((a, b) => {
    if (a.hasUpcomingScreenings !== b.hasUpcomingScreenings) {
      return a.hasUpcomingScreenings ? -1 : 1;
    }
    if (a.upcomingScreeningCount !== b.upcomingScreeningCount) {
      return b.upcomingScreeningCount - a.upcomingScreeningCount;
    }
    return b.missingFields.length - a.missingFields.length;
  });

  // Trim to limit
  gaps = gaps.slice(0, limit);

  const summary: AuditSummary = {
    totalFilms,
    filmsWithUpcoming: upcomingFilmIds.size,
    missingPoster: missingPoster.count,
    missingSynopsis: missingSynopsis.count,
    missingLetterboxdRating: missingLetterboxd.count,
    missingTmdbId: missingTmdb.count,
    missingYear: missingYear.count,
    missingDirectors: missingDirectors.count,
    missingGenres: missingGenres.count,
    missingRuntime: missingRuntime.count,
    missingPosterUpcoming: missingPosterUpcoming.count,
    missingSynopsisUpcoming: missingSynopsisUpcoming.count,
    missingLetterboxdRatingUpcoming: missingLetterboxdUpcoming.count,
    missingTmdbIdUpcoming: missingTmdbUpcoming.count,
  };

  return {
    summary,
    gaps,
    generatedAt: now.toISOString(),
  };
}

/**
 * Format a percentage string
 */
function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

/**
 * Print formatted terminal output
 */
function printReport(result: AuditResult) {
  const { summary, gaps } = result;

  console.log("\n=== Film Data Quality Audit ===\n");
  console.log(`Total films: ${summary.totalFilms}`);
  console.log(`Films with upcoming screenings: ${summary.filmsWithUpcoming}`);

  console.log("\n--- Missing Data (All Films) ---");
  console.log(`  Poster:           ${summary.missingPoster} (${pct(summary.totalFilms - summary.missingPoster, summary.totalFilms)} have)`);
  console.log(`  Synopsis:         ${summary.missingSynopsis} (${pct(summary.totalFilms - summary.missingSynopsis, summary.totalFilms)} have)`);
  console.log(`  Letterboxd:       ${summary.missingLetterboxdRating} (${pct(summary.totalFilms - summary.missingLetterboxdRating, summary.totalFilms)} have)`);
  console.log(`  TMDB ID:          ${summary.missingTmdbId} (${pct(summary.totalFilms - summary.missingTmdbId, summary.totalFilms)} have)`);
  console.log(`  Year:             ${summary.missingYear}`);
  console.log(`  Directors:        ${summary.missingDirectors}`);
  console.log(`  Genres:           ${summary.missingGenres}`);
  console.log(`  Runtime:          ${summary.missingRuntime}`);

  console.log("\n--- Missing Data (Upcoming Films Only) ---");
  console.log(`  Poster:           ${summary.missingPosterUpcoming}`);
  console.log(`  Synopsis:         ${summary.missingSynopsisUpcoming}`);
  console.log(`  Letterboxd:       ${summary.missingLetterboxdRatingUpcoming}`);
  console.log(`  TMDB ID:          ${summary.missingTmdbIdUpcoming}`);

  if (gaps.length > 0) {
    console.log(`\n--- Top ${gaps.length} Films with Gaps ---`);
    console.log(
      "Title".padEnd(45) +
      "Year".padEnd(6) +
      "Upcoming".padEnd(10) +
      "Missing Fields"
    );
    console.log("-".repeat(100));

    for (const gap of gaps.slice(0, 50)) {
      const title = gap.title.length > 42 ? gap.title.slice(0, 42) + "..." : gap.title;
      console.log(
        title.padEnd(45) +
        (gap.year?.toString() || "?").padEnd(6) +
        gap.upcomingScreeningCount.toString().padEnd(10) +
        gap.missingFields.join(", ")
      );
    }

    if (gaps.length > 50) {
      console.log(`\n... and ${gaps.length - 50} more films with gaps`);
    }
  }

  console.log("\n=== Audit Complete ===\n");
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const upcomingOnly = args.includes("--upcoming-only");

  const result = await auditFilmData(upcomingOnly);

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReport(result);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
