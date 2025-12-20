/**
 * Enrich existing films with real TMDB data
 * Updates poster URLs, backdrops, and other metadata
 */

import { db } from "./index";
import { films } from "./schema";
import { eq } from "drizzle-orm";
import { matchFilmToTMDB, getTMDBClient } from "@/lib/tmdb";

async function enrichFilms() {
  console.log("🎬 Enriching films with TMDB data...\n");

  const client = getTMDBClient();
  const allFilms = await db.select().from(films);

  console.log(`Found ${allFilms.length} films to enrich\n`);

  let enriched = 0;
  let failed = 0;

  for (const film of allFilms) {
    try {
      console.log(`Processing: ${film.title} (${film.year || "unknown year"})...`);

      // Try to match with TMDB
      const match = await matchFilmToTMDB(film.title, {
        year: film.year ?? undefined,
        director: film.directors[0],
      });

      if (!match) {
        console.log(`  ✗ No TMDB match found\n`);
        failed++;
        continue;
      }

      // Get full details
      const details = await client.getFullFilmData(match.tmdbId);

      // Update the film
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
          genres: details.details.genres.map((g) => g.name.toLowerCase()),
          countries: details.details.production_countries.map((c) => c.iso_3166_1),
          languages: details.details.spoken_languages.map((l) => l.iso_639_1),
          certification: details.certification || film.certification,
          synopsis: details.details.overview || film.synopsis,
          tagline: details.details.tagline || film.tagline,
          posterUrl: details.details.poster_path
            ? `https://image.tmdb.org/t/p/w500${details.details.poster_path}`
            : film.posterUrl,
          backdropUrl: details.details.backdrop_path
            ? `https://image.tmdb.org/t/p/w1280${details.details.backdrop_path}`
            : film.backdropUrl,
          tmdbRating: details.details.vote_average,
          updatedAt: new Date(),
        })
        .where(eq(films.id, film.id));

      console.log(`  ✓ Updated with TMDB ID ${match.tmdbId}`);
      console.log(`    Poster: ${details.details.poster_path ? "Yes" : "No"}`);
      console.log(`    Backdrop: ${details.details.backdrop_path ? "Yes" : "No"}\n`);

      enriched++;

      // Rate limiting - TMDB allows 40 requests per 10 seconds
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`  ✗ Error: ${error}\n`);
      failed++;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`✅ Enriched: ${enriched} films`);
  console.log(`❌ Failed: ${failed} films`);
}

enrichFilms()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
