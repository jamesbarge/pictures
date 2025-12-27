/**
 * Reprocess Suspicious Film Matches
 *
 * Finds films that may have been incorrectly matched to TMDB and flags them for review.
 * Focuses on:
 * - Short/ambiguous titles (1-2 words)
 * - Films matched without year/director hints
 * - Films with upcoming screenings (worth fixing)
 *
 * Run with: npx tsx src/scripts/reprocess-suspicious-matches.ts
 * Options:
 *   --dry-run     Show what would be done without making changes
 *   --fix         Actually update the database with new matches
 *   --cinema=X    Only process films from a specific cinema
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { sql, eq, and, gte, isNull, or } from "drizzle-orm";
import postgres from "postgres";
import * as dotenv from "dotenv";
import path from "path";
import { films } from "../db/schema/films";
import { screenings } from "../db/schema/screenings";
import { analyzeTitleAmbiguity } from "../lib/tmdb/ambiguity";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL not set");
}

interface SuspiciousFilm {
  id: string;
  title: string;
  tmdbId: number | null;
  year: number | null;
  directors: string[];
  matchStrategy: string | null;
  matchConfidence: number | null;
  ambiguityScore: number;
  ambiguityReasons: string[];
  screeningCount: number;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const shouldFix = args.includes("--fix");
  const cinemaArg = args.find((a) => a.startsWith("--cinema="));
  const cinemaFilter = cinemaArg?.split("=")[1];

  console.log("=".repeat(60));
  console.log("Reprocess Suspicious Film Matches");
  console.log("=".repeat(60));
  console.log(`Mode: ${isDryRun ? "DRY RUN" : shouldFix ? "FIX MODE" : "ANALYSIS ONLY"}`);
  if (cinemaFilter) console.log(`Cinema filter: ${cinemaFilter}`);
  console.log();

  const client = postgres(connectionString!, { max: 1 });
  const db = drizzle(client);

  try {
    // Find films with upcoming screenings that may be mismatched
    const now = new Date();
    const suspiciousFilms: SuspiciousFilm[] = [];

    // Query films with upcoming screenings
    const filmsWithScreenings = await db
      .select({
        film: films,
        screeningCount: sql<number>`count(${screenings.id})::int`,
      })
      .from(films)
      .leftJoin(screenings, eq(films.id, screenings.filmId))
      .where(
        and(
          gte(screenings.datetime, now),
          cinemaFilter ? eq(screenings.cinemaId, cinemaFilter) : undefined
        )
      )
      .groupBy(films.id);

    console.log(`Found ${filmsWithScreenings.length} films with upcoming screenings`);
    console.log();

    // Analyze each film for ambiguity
    for (const { film, screeningCount } of filmsWithScreenings) {
      const ambiguity = analyzeTitleAmbiguity(film.title);

      // Flag as suspicious if:
      // 1. Ambiguous title (short, common word, etc.)
      // 2. Never had proper match tracking
      // 3. Low confidence match
      const isSuspicious =
        ambiguity.requiresReview ||
        film.matchStrategy === null ||
        (film.matchConfidence !== null && film.matchConfidence < 0.7);

      if (isSuspicious) {
        suspiciousFilms.push({
          id: film.id,
          title: film.title,
          tmdbId: film.tmdbId,
          year: film.year,
          directors: film.directors,
          matchStrategy: film.matchStrategy,
          matchConfidence: film.matchConfidence,
          ambiguityScore: ambiguity.score,
          ambiguityReasons: ambiguity.reasons,
          screeningCount,
        });
      }
    }

    // Sort by ambiguity score (highest first) and screening count
    suspiciousFilms.sort((a, b) => {
      // First by ambiguity
      if (b.ambiguityScore !== a.ambiguityScore) {
        return b.ambiguityScore - a.ambiguityScore;
      }
      // Then by screening count (more screenings = higher priority)
      return b.screeningCount - a.screeningCount;
    });

    console.log("-".repeat(60));
    console.log(`SUSPICIOUS FILMS (${suspiciousFilms.length} found)`);
    console.log("-".repeat(60));

    if (suspiciousFilms.length === 0) {
      console.log("No suspicious films found! 🎉");
      return;
    }

    // Group by severity
    const highPriority = suspiciousFilms.filter(
      (f) => f.ambiguityScore >= 0.7 || f.matchStrategy === null
    );
    const mediumPriority = suspiciousFilms.filter(
      (f) => f.ambiguityScore >= 0.4 && f.ambiguityScore < 0.7 && f.matchStrategy !== null
    );
    const lowPriority = suspiciousFilms.filter(
      (f) => f.ambiguityScore < 0.4 && f.matchStrategy !== null
    );

    console.log();
    console.log(`HIGH PRIORITY (${highPriority.length} films):`);
    console.log("Highly ambiguous titles or untracked matches");
    for (const film of highPriority.slice(0, 20)) {
      printFilmInfo(film);
    }
    if (highPriority.length > 20) {
      console.log(`  ... and ${highPriority.length - 20} more`);
    }

    console.log();
    console.log(`MEDIUM PRIORITY (${mediumPriority.length} films):`);
    console.log("Moderately ambiguous titles");
    for (const film of mediumPriority.slice(0, 10)) {
      printFilmInfo(film);
    }
    if (mediumPriority.length > 10) {
      console.log(`  ... and ${mediumPriority.length - 10} more`);
    }

    console.log();
    console.log(`LOW PRIORITY (${lowPriority.length} films):`);
    console.log("Lower ambiguity but may still need review");
    for (const film of lowPriority.slice(0, 5)) {
      printFilmInfo(film);
    }
    if (lowPriority.length > 5) {
      console.log(`  ... and ${lowPriority.length - 5} more`);
    }

    // Summary statistics
    console.log();
    console.log("=".repeat(60));
    console.log("SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total suspicious: ${suspiciousFilms.length}`);
    console.log(`  High priority: ${highPriority.length}`);
    console.log(`  Medium priority: ${mediumPriority.length}`);
    console.log(`  Low priority: ${lowPriority.length}`);
    console.log();

    // Count by reason
    const reasonCounts = new Map<string, number>();
    for (const film of suspiciousFilms) {
      for (const reason of film.ambiguityReasons) {
        reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
      }
      if (film.matchStrategy === null) {
        reasonCounts.set("Untracked match", (reasonCounts.get("Untracked match") || 0) + 1);
      }
    }

    console.log("Reasons:");
    for (const [reason, count] of Array.from(reasonCounts.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${reason}: ${count}`);
    }

    // If fix mode, update matchStrategy for untracked films
    if (shouldFix && !isDryRun) {
      console.log();
      console.log("Marking untracked films as 'needs-review'...");

      const untrackedIds = suspiciousFilms
        .filter((f) => f.matchStrategy === null)
        .map((f) => f.id);

      if (untrackedIds.length > 0) {
        await db
          .update(films)
          .set({ matchStrategy: "needs-review" })
          .where(
            and(
              sql`${films.id} = ANY(${untrackedIds})`,
              isNull(films.matchStrategy)
            )
          );
        console.log(`✓ Marked ${untrackedIds.length} films as 'needs-review'`);
      }
    }

    console.log();
    console.log("Next steps:");
    console.log("1. Review high priority films manually");
    console.log("2. For each film, verify the TMDB match is correct");
    console.log("3. If incorrect, update the film record with correct tmdbId");
    console.log("4. Run scrapers again to capture director/year for new screenings");

  } finally {
    await client.end();
  }
}

function printFilmInfo(film: SuspiciousFilm): void {
  const confidence = film.matchConfidence !== null
    ? `${(film.matchConfidence * 100).toFixed(0)}%`
    : "N/A";
  const strategy = film.matchStrategy || "untracked";
  const tmdbLink = film.tmdbId
    ? `https://www.themoviedb.org/movie/${film.tmdbId}`
    : "no TMDB link";

  console.log();
  console.log(`  "${film.title}" (${film.year || "year unknown"})`);
  console.log(`    TMDB: ${tmdbLink}`);
  console.log(`    Directors: ${film.directors.join(", ") || "none"}`);
  console.log(`    Match: ${strategy} @ ${confidence} confidence`);
  console.log(`    Ambiguity: ${(film.ambiguityScore * 100).toFixed(0)}% - ${film.ambiguityReasons.join(", ")}`);
  console.log(`    Screenings: ${film.screeningCount} upcoming`);
}

main().catch(console.error);
