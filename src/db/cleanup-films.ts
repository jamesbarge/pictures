/**
 * Film Cleanup Script
 *
 * Fixes common issues with film records:
 * 1. Cleans titles that have BBFC ratings, brackets, etc.
 * 2. Merges duplicate films
 * 3. Re-enriches films that failed to match TMDB due to dirty titles
 *
 * Run with: npm run db:cleanup-films
 */

import { db } from "./index";
import { films, screenings } from "./schema";
import { eq, sql, isNull, or } from "drizzle-orm";
import { matchFilmToTMDB, getTMDBClient, isRepertoryFilm, getDecade } from "@/lib/tmdb";

// Same cleaning logic as pipeline
function cleanFilmTitle(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .replace(/\s*\((U|PG|12A?|15|18)\*?\)\s*$/i, "")
    .replace(/\s*\[.*?\]\s*$/g, "")
    .replace(/\s*-\s*(35mm|70mm|4k|imax)\s*$/i, "")
    .trim();
}

function normalizeTitle(title: string): string {
  return cleanFilmTitle(title)
    .toLowerCase()
    .replace(/^the\s+/i, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function cleanup() {
  console.log("🧹 Cleaning up film records...\n");

  const allFilms = await db.select().from(films);
  console.log(`Found ${allFilms.length} films total\n`);

  // Step 1: Find films with dirty titles
  const dirtyFilms = allFilms.filter(f => {
    const cleaned = cleanFilmTitle(f.title);
    return cleaned !== f.title;
  });

  console.log(`Found ${dirtyFilms.length} films with dirty titles:\n`);
  dirtyFilms.forEach(f => {
    console.log(`  "${f.title}" -> "${cleanFilmTitle(f.title)}"`);
  });

  // Step 2: Clean titles and find duplicates
  const filmsByNormalized = new Map<string, typeof allFilms>();

  for (const film of allFilms) {
    const normalized = normalizeTitle(film.title);
    if (!filmsByNormalized.has(normalized)) {
      filmsByNormalized.set(normalized, []);
    }
    filmsByNormalized.get(normalized)!.push(film);
  }

  // Find duplicates (normalized title appears more than once)
  const duplicateGroups = Array.from(filmsByNormalized.entries())
    .filter(([_, films]) => films.length > 1);

  console.log(`\nFound ${duplicateGroups.length} groups of duplicate films:\n`);

  let merged = 0;
  let cleaned = 0;
  let enriched = 0;

  for (const [normalizedTitle, duplicates] of duplicateGroups) {
    console.log(`\nDuplicate group: "${normalizedTitle}"`);
    duplicates.forEach(f => {
      console.log(`  - "${f.title}" (tmdb=${f.tmdbId || 'none'}, poster=${f.posterUrl ? 'YES' : 'NO'})`);
    });

    // Find the "best" film (has TMDB ID, has poster, has year)
    const sorted = [...duplicates].sort((a, b) => {
      if (a.tmdbId && !b.tmdbId) return -1;
      if (!a.tmdbId && b.tmdbId) return 1;
      if (a.posterUrl && !b.posterUrl) return -1;
      if (!a.posterUrl && b.posterUrl) return 1;
      if (a.year && !b.year) return -1;
      if (!a.year && b.year) return 1;
      return 0;
    });

    const primary = sorted[0];
    const toMerge = sorted.slice(1);

    // Update screenings to point to primary film
    for (const dup of toMerge) {
      const updated = await db
        .update(screenings)
        .set({ filmId: primary.id })
        .where(eq(screenings.filmId, dup.id));

      console.log(`  Moved screenings from "${dup.title}" to "${primary.title}"`);

      // Delete the duplicate film
      await db.delete(films).where(eq(films.id, dup.id));
      console.log(`  Deleted duplicate: "${dup.title}"`);
      merged++;
    }

    // Clean the primary film's title if needed
    const cleanedTitle = cleanFilmTitle(primary.title);
    if (cleanedTitle !== primary.title) {
      await db
        .update(films)
        .set({ title: cleanedTitle, updatedAt: new Date() })
        .where(eq(films.id, primary.id));
      console.log(`  Cleaned title: "${primary.title}" -> "${cleanedTitle}"`);
      cleaned++;
    }
  }

  // Step 3: Clean non-duplicate dirty titles
  for (const film of dirtyFilms) {
    // Skip if already processed as duplicate
    if (duplicateGroups.some(([_, dups]) => dups.some(d => d.id === film.id))) {
      continue;
    }

    const cleanedTitle = cleanFilmTitle(film.title);
    await db
      .update(films)
      .set({ title: cleanedTitle, updatedAt: new Date() })
      .where(eq(films.id, film.id));
    console.log(`Cleaned: "${film.title}" -> "${cleanedTitle}"`);
    cleaned++;
  }

  // Step 4: Re-enrich films that don't have TMDB data
  console.log("\n🔍 Re-enriching films without TMDB data...\n");

  const filmsWithoutTmdb = await db
    .select()
    .from(films)
    .where(isNull(films.tmdbId));

  console.log(`Found ${filmsWithoutTmdb.length} films without TMDB data\n`);

  const client = getTMDBClient();

  for (const film of filmsWithoutTmdb) {
    try {
      const match = await matchFilmToTMDB(film.title, {
        year: film.year ?? undefined,
        director: film.directors[0],
      });

      if (match) {
        const details = await client.getFullFilmData(match.tmdbId);

        await db
          .update(films)
          .set({
            tmdbId: match.tmdbId,
            imdbId: details.details.imdb_id || film.imdbId,
            title: details.details.title,
            originalTitle: details.details.original_title,
            year: match.year,
            runtime: details.details.runtime || film.runtime,
            directors: details.directors.length > 0 ? details.directors : film.directors,
            cast: details.cast.length > 0 ? details.cast : film.cast,
            genres: details.details.genres.map(g => g.name.toLowerCase()),
            posterUrl: details.details.poster_path
              ? `https://image.tmdb.org/t/p/w500${details.details.poster_path}`
              : film.posterUrl,
            backdropUrl: details.details.backdrop_path
              ? `https://image.tmdb.org/t/p/w1280${details.details.backdrop_path}`
              : film.backdropUrl,
            isRepertory: isRepertoryFilm(details.details.release_date),
            decade: match.year ? getDecade(match.year) : film.decade,
            tmdbRating: details.details.vote_average,
            updatedAt: new Date(),
          })
          .where(eq(films.id, film.id));

        console.log(`  ✓ Enriched: "${film.title}" -> TMDB ${match.tmdbId}`);
        enriched++;
      } else {
        console.log(`  ✗ No TMDB match: "${film.title}"`);
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 300));
    } catch (error) {
      console.error(`  ✗ Error enriching "${film.title}":`, error);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("Cleanup complete:");
  console.log(`  Merged:   ${merged} duplicate films`);
  console.log(`  Cleaned:  ${cleaned} dirty titles`);
  console.log(`  Enriched: ${enriched} films with TMDB data`);
  console.log("=".repeat(50));
}

cleanup()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Error:", err);
    process.exit(1);
  });
