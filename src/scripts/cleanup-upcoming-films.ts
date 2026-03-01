/**
 * Cleanup upcoming films: fix titles, match TMDB, fill metadata gaps, enrich Letterboxd
 *
 * Phases:
 *   1. Title cleanup (HTML entities, quotes, foreign text, event prefixes, AI extraction)
 *   2. TMDB matching for unmatched films
 *   3. Fill metadata gaps for already-matched films
 *   4. Letterboxd enrichment
 *
 * Usage:
 *   npm run cleanup:upcoming                    # run all phases
 *   npm run cleanup:upcoming -- --dry-run       # preview only
 *   npm run cleanup:upcoming -- --phase 1       # run specific phase
 *   npm run cleanup:upcoming -- --phase 2 --dry-run
 */

import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { eq, isNull, gte, and } from "drizzle-orm";
import { matchFilmToTMDB, getTMDBClient } from "@/lib/tmdb";
import { extractFilmTitle } from "@/lib/title-extraction";
import { cleanFilmTitle } from "@/scrapers/pipeline";
import { decodeHtmlEntities } from "@/scripts/enrich-upcoming-films";
import { enrichLetterboxdRatings } from "@/db/enrich-letterboxd";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes("--dry-run");
const phaseIndex = process.argv.indexOf("--phase");
const PHASE_FILTER = phaseIndex !== -1 ? parseInt(process.argv[phaseIndex + 1], 10) : null;

const TMDB_RATE_MS = 300;
const AI_RATE_MS = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FilmRow = {
  id: string;
  title: string;
  year: number | null;
  directors: string[];
  tmdbId: number | null;
  synopsis: string | null;
  genres: string[];
  runtime: number | null;
  posterUrl: string | null;
};

/**
 * Get all films that have at least one upcoming screening.
 */
async function getUpcomingFilms(): Promise<FilmRow[]> {
  const now = new Date();
  return db
    .selectDistinct({
      id: films.id,
      title: films.title,
      year: films.year,
      directors: films.directors,
      tmdbId: films.tmdbId,
      synopsis: films.synopsis,
      genres: films.genres,
      runtime: films.runtime,
      posterUrl: films.posterUrl,
    })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(gte(screenings.datetime, now));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Strip surrounding quotation marks from a title.
 * "Wuthering Heights" → Wuthering Heights
 */
function stripSurroundingQuotes(title: string): string {
  // Match balanced double/single/curly quotes
  const patterns: [RegExp, string][] = [
    [/^"(.*)"$/, "$1"],
    [/^'(.*)'$/, "$1"],
    [/^\u201C(.*)\u201D$/, "$1"], // left/right double curly quotes
    [/^\u2018(.*)\u2019$/, "$1"], // left/right single curly quotes
  ];

  for (const [pattern, replacement] of patterns) {
    if (pattern.test(title)) {
      return title.replace(pattern, replacement).trim();
    }
  }
  return title;
}

/**
 * Strip appended non-Latin text after Latin text.
 * "No Other Choice 선택의 여지가 없다" → "No Other Choice"
 *
 * Detects: Hangul, CJK Unified Ideographs, Cyrillic, Arabic, Devanagari, Thai, Japanese Kana
 */
function stripForeignSuffix(title: string): string {
  // Match Latin text followed by whitespace and non-Latin Unicode blocks
  // The non-Latin block must be at the end of the string
  const match = title.match(
    /^([\p{Script=Latin}\p{N}\p{P}\s]+?)\s+([\p{Script=Hangul}\p{Script=Han}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Devanagari}\p{Script=Thai}\p{Script=Hiragana}\p{Script=Katakana}][\p{Script=Hangul}\p{Script=Han}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Devanagari}\p{Script=Thai}\p{Script=Hiragana}\p{Script=Katakana}\s\p{P}]*)$/u
  );

  if (match) {
    return match[1].trim();
  }
  return title;
}

// ---------------------------------------------------------------------------
// Phase 1: Title Cleanup
// ---------------------------------------------------------------------------

async function phase1TitleCleanup(upcomingFilms: FilmRow[]): Promise<number> {
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 1: Title Cleanup");
  console.log("=".repeat(60) + "\n");

  let updated = 0;

  for (let i = 0; i < upcomingFilms.length; i++) {
    const film = upcomingFilms[i];
    const original = film.title;
    let cleaned = original;

    // Step 1: Decode HTML entities
    cleaned = decodeHtmlEntities(cleaned);

    // Step 2: Strip surrounding quotes
    cleaned = stripSurroundingQuotes(cleaned);

    // Step 3: Strip appended foreign text
    cleaned = stripForeignSuffix(cleaned);

    // Step 4: Clean event prefixes via pipeline
    cleaned = cleanFilmTitle(cleaned);

    // Step 5: AI extraction for remaining complex titles
    if (cleaned.includes(":") || cleaned.includes("+") || cleaned.includes("\u2013")) {
      try {
        const extraction = await extractFilmTitle(cleaned);
        if (extraction.confidence !== "low" && extraction.filmTitle !== cleaned) {
          cleaned = extraction.filmTitle;
        }
        await sleep(AI_RATE_MS);
      } catch {
        // AI extraction failed, continue with cleaned title
      }
    }

    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    if (cleaned === original) continue;

    console.log(`[${i + 1}/${upcomingFilms.length}] "${original}" → "${cleaned}"`);

    if (!DRY_RUN) {
      await db
        .update(films)
        .set({ title: cleaned, updatedAt: new Date() })
        .where(eq(films.id, film.id));
    }

    updated++;
  }

  console.log(`\nPhase 1 complete: ${updated} titles ${DRY_RUN ? "would be " : ""}updated`);
  return updated;
}

// ---------------------------------------------------------------------------
// Phase 2: TMDB Matching (unmatched films)
// ---------------------------------------------------------------------------

async function phase2TMDBMatching(upcomingFilms: FilmRow[]): Promise<{ matched: number; skipped: number }> {
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 2: TMDB Matching (unmatched films)");
  console.log("=".repeat(60) + "\n");

  const unmatched = upcomingFilms.filter((f) => f.tmdbId === null);
  console.log(`Found ${unmatched.length} unmatched films with upcoming screenings\n`);

  if (unmatched.length === 0) return { matched: 0, skipped: 0 };

  const client = getTMDBClient();
  let matched = 0;
  let skipped = 0;

  for (let i = 0; i < unmatched.length; i++) {
    const film = unmatched[i];

    // Clear suspicious years
    let yearHint = film.year ?? undefined;
    if (yearHint && yearHint > 2025) {
      console.log(`  Warning: Clearing suspicious year ${yearHint} for "${film.title}"`);
      yearHint = undefined;
    }

    console.log(`[${i + 1}/${unmatched.length}] "${film.title}"`);

    try {
      const tmdbMatch = await matchFilmToTMDB(film.title, {
        year: yearHint,
        director: film.directors[0],
        skipAmbiguityCheck: true,
      });

      if (!tmdbMatch) {
        console.log(`  X No TMDB match\n`);
        await sleep(TMDB_RATE_MS);
        continue;
      }

      console.log(`  -> TMDB: "${tmdbMatch.title}" (${tmdbMatch.year}) [ID: ${tmdbMatch.tmdbId}, conf: ${tmdbMatch.confidence.toFixed(2)}]`);

      if (DRY_RUN) {
        console.log(`  [dry-run] Would update film record\n`);
        matched++;
        await sleep(TMDB_RATE_MS);
        continue;
      }

      // Check for duplicate TMDB IDs
      const existing = await db
        .select({ id: films.id, title: films.title })
        .from(films)
        .where(eq(films.tmdbId, tmdbMatch.tmdbId))
        .limit(1);

      if (existing.length > 0) {
        console.log(`  ~ Skipped: TMDB ID ${tmdbMatch.tmdbId} already used by "${existing[0].title}"\n`);
        skipped++;
        await sleep(TMDB_RATE_MS);
        continue;
      }

      // Fetch full data and update
      const details = await client.getFullFilmData(tmdbMatch.tmdbId);

      await db
        .update(films)
        .set({
          tmdbId: tmdbMatch.tmdbId,
          imdbId: details.details.imdb_id || null,
          title: details.details.title,
          originalTitle: details.details.original_title,
          year: tmdbMatch.year,
          runtime: details.details.runtime || null,
          directors: details.directors.length > 0 ? details.directors : film.directors,
          cast: details.cast.length > 0 ? details.cast : [],
          genres: details.details.genres.map((g) => g.name.toLowerCase()),
          countries: details.details.production_countries.map((c) => c.iso_3166_1),
          languages: details.details.spoken_languages.map((l) => l.iso_639_1),
          certification: details.certification || null,
          synopsis: details.details.overview || null,
          tagline: details.details.tagline || null,
          posterUrl: details.details.poster_path
            ? `https://image.tmdb.org/t/p/w500${details.details.poster_path}`
            : null,
          backdropUrl: details.details.backdrop_path
            ? `https://image.tmdb.org/t/p/w1280${details.details.backdrop_path}`
            : null,
          tmdbRating: details.details.vote_average,
          matchConfidence: tmdbMatch.confidence,
          matchStrategy: "cleanup-upcoming",
          matchedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(films.id, film.id));

      console.log(`  -> Updated\n`);
      matched++;
    } catch (error) {
      console.error(`  X Error: ${error}\n`);
      skipped++;
    }

    await sleep(TMDB_RATE_MS);
  }

  console.log(`\nPhase 2 complete: ${matched} matched, ${skipped} skipped`);
  return { matched, skipped };
}

// ---------------------------------------------------------------------------
// Phase 3: Fill Metadata Gaps (matched films missing data)
// ---------------------------------------------------------------------------

async function phase3FillGaps(upcomingFilms: FilmRow[]): Promise<number> {
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 3: Fill Metadata Gaps");
  console.log("=".repeat(60) + "\n");

  // Films that have a TMDB ID but are missing key fields
  const gapped = upcomingFilms.filter(
    (f) =>
      f.tmdbId !== null &&
      (!f.synopsis || f.genres.length === 0 || !f.runtime || !f.year || !f.posterUrl)
  );

  console.log(`Found ${gapped.length} matched films with missing metadata\n`);

  if (gapped.length === 0) return 0;

  const client = getTMDBClient();
  let filled = 0;

  for (let i = 0; i < gapped.length; i++) {
    const film = gapped[i];
    const missing: string[] = [];
    if (!film.synopsis) missing.push("synopsis");
    if (film.genres.length === 0) missing.push("genres");
    if (!film.runtime) missing.push("runtime");
    if (!film.year) missing.push("year");
    if (!film.posterUrl) missing.push("poster");

    console.log(`[${i + 1}/${gapped.length}] "${film.title}" — missing: ${missing.join(", ")}`);

    if (DRY_RUN) {
      console.log(`  [dry-run] Would re-fetch TMDB data\n`);
      filled++;
      await sleep(TMDB_RATE_MS);
      continue;
    }

    try {
      const details = await client.getFullFilmData(film.tmdbId!);
      const releaseYear = details.details.release_date
        ? parseInt(details.details.release_date.split("-")[0], 10)
        : null;

      // Only fill missing fields — don't overwrite existing data
      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (!film.synopsis && details.details.overview) {
        updates.synopsis = details.details.overview;
      }
      if (film.genres.length === 0 && details.details.genres.length > 0) {
        updates.genres = details.details.genres.map((g) => g.name.toLowerCase());
      }
      if (!film.runtime && details.details.runtime) {
        updates.runtime = details.details.runtime;
      }
      if (!film.year && releaseYear) {
        updates.year = releaseYear;
      }
      if (!film.posterUrl && details.details.poster_path) {
        updates.posterUrl = `https://image.tmdb.org/t/p/w500${details.details.poster_path}`;
      }
      if (film.directors.length === 0 && details.directors.length > 0) {
        updates.directors = details.directors;
      }

      // Only update if we actually have new data
      if (Object.keys(updates).length > 1) {
        await db.update(films).set(updates).where(eq(films.id, film.id));
        console.log(`  -> Filled: ${Object.keys(updates).filter((k) => k !== "updatedAt").join(", ")}\n`);
        filled++;
      } else {
        console.log(`  -> TMDB also missing this data\n`);
      }
    } catch (error) {
      console.error(`  X Error: ${error}\n`);
    }

    await sleep(TMDB_RATE_MS);
  }

  console.log(`\nPhase 3 complete: ${filled} films ${DRY_RUN ? "would be " : ""}updated`);
  return filled;
}

// ---------------------------------------------------------------------------
// Phase 4: Letterboxd Enrichment
// ---------------------------------------------------------------------------

async function phase4Letterboxd(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 4: Letterboxd Enrichment");
  console.log("=".repeat(60) + "\n");

  if (DRY_RUN) {
    // Count how many would be enriched
    const now = new Date();
    const needsLetterboxd = await db
      .selectDistinct({ id: films.id })
      .from(films)
      .innerJoin(screenings, eq(films.id, screenings.filmId))
      .where(
        and(
          isNull(films.letterboxdRating),
          eq(films.contentType, "film"),
          gte(screenings.datetime, now)
        )
      );
    console.log(`[dry-run] ${needsLetterboxd.length} films would be enriched with Letterboxd ratings\n`);
    return;
  }

  const result = await enrichLetterboxdRatings(undefined, true);
  console.log(`\nPhase 4 complete: ${result.enriched} enriched, ${result.failed} not found`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no changes will be written\n" : "Cleaning up upcoming films\n");

  if (PHASE_FILTER) {
    console.log(`Running phase ${PHASE_FILTER} only\n`);
  }

  // Re-query for each phase in case earlier phases changed data
  const shouldRun = (phase: number) => !PHASE_FILTER || PHASE_FILTER === phase;

  if (shouldRun(1)) {
    const upcomingFilms = await getUpcomingFilms();
    console.log(`Total films with upcoming screenings: ${upcomingFilms.length}`);
    await phase1TitleCleanup(upcomingFilms);
  }

  if (shouldRun(2)) {
    const upcomingFilms = await getUpcomingFilms();
    await phase2TMDBMatching(upcomingFilms);
  }

  if (shouldRun(3)) {
    const upcomingFilms = await getUpcomingFilms();
    await phase3FillGaps(upcomingFilms);
  }

  if (shouldRun(4)) {
    await phase4Letterboxd();
  }

  if (DRY_RUN) {
    console.log("\n(Dry run — no changes were written)");
  }
}

main()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
