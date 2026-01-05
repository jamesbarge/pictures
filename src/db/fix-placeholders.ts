/**
 * Fix Placeholder Films
 *
 * Processes films with placeholder posters:
 * 1. AI classification (film vs event vs concert)
 * 2. Title cleaning and TMDB matching
 * 3. Duplicate merging
 */

import { db } from "./index";
import { films, screenings } from "./schema";
import { eq, like, and, isNotNull } from "drizzle-orm";
import { matchFilmToTMDB, getTMDBClient } from "@/lib/tmdb";
import { classifyContent } from "@/lib/content-classifier";

async function fixPlaceholderFilms() {
  const placeholderFilms = await db.select().from(films)
    .where(like(films.posterUrl, "/api/poster-placeholder%"));

  console.log(`Processing ${placeholderFilms.length} placeholder films...\n`);
  const tmdb = getTMDBClient();

  let merged = 0, classified = 0, posterFound = 0;

  for (const film of placeholderFilms) {
    console.log(`\n"${film.title}"`);

    // AI classification
    const result = await classifyContent(film.title);
    console.log(`  Classification: ${result.contentType} (${result.confidence})`);
    console.log(`  Clean title: "${result.cleanTitle}"`);

    // Update content type if different
    if (result.contentType !== film.contentType) {
      await db.update(films).set({
        contentType: result.contentType,
        updatedAt: new Date()
      }).where(eq(films.id, film.id));
      classified++;
    }

    // Skip non-films for TMDB matching
    if (result.contentType !== "film") {
      console.log(`  ⏭️  Skipping TMDB (non-film)`);
      continue;
    }

    // Try TMDB match with cleaned title
    if (result.cleanTitle !== film.title || film.tmdbId === null) {
      try {
        const match = await matchFilmToTMDB(result.cleanTitle, {
          year: result.year,
          skipAmbiguityCheck: true,
        });

        if (match) {
          console.log(`  TMDB match: ${match.title} (${match.year}) [${(match.confidence * 100).toFixed(0)}%]`);

          // Check for existing film with this TMDB ID
          const [existing] = await db.select().from(films)
            .where(and(eq(films.tmdbId, match.tmdbId), isNotNull(films.posterUrl)));

          if (existing && existing.id !== film.id) {
            // Merge into existing
            await db.update(screenings).set({ filmId: existing.id })
              .where(eq(screenings.filmId, film.id));
            await db.delete(films).where(eq(films.id, film.id));
            console.log(`  ✓ MERGED into "${existing.title}"`);
            merged++;
          } else {
            // Update this film with TMDB data
            const details = await tmdb.getFullFilmData(match.tmdbId);
            const posterUrl = details.details.poster_path
              ? `https://image.tmdb.org/t/p/w500${details.details.poster_path}`
              : null;

            if (posterUrl) {
              await db.update(films).set({
                tmdbId: match.tmdbId,
                title: details.details.title,
                posterUrl,
                year: match.year,
                updatedAt: new Date(),
              }).where(eq(films.id, film.id));
              console.log(`  ✓ POSTER FOUND`);
              posterFound++;
            }
          }
        }
      } catch (err) {
        console.log(`  ✗ Error: ${err}`);
      }
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Merged: ${merged}`);
  console.log(`Classified: ${classified}`);
  console.log(`Posters found: ${posterFound}`);
}

fixPlaceholderFilms()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
