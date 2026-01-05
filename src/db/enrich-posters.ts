/**
 * Poster Enrichment Script
 *
 * Finds missing posters for films using multiple sources:
 * 1. TMDB (primary)
 * 2. OMDB (IMDb data)
 * 3. Fanart.tv (artistic posters)
 * 4. Scraper-provided URLs
 * 5. Generated placeholders (last resort)
 *
 * Run with: npm run db:enrich-posters
 */

import { db } from "./index";
import { films } from "./schema";
import { eq, isNull, or } from "drizzle-orm";
import { getPosterService } from "@/lib/posters";

async function enrichPosters() {
  console.log("🎬 Finding posters for films without images...\n");

  const posterService = getPosterService();

  // Find films without posters
  const filmsWithoutPosters = await db
    .select()
    .from(films)
    .where(
      or(
        isNull(films.posterUrl),
        eq(films.posterUrl, "")
      )
    );

  console.log(`Found ${filmsWithoutPosters.length} films without posters\n`);

  if (filmsWithoutPosters.length === 0) {
    console.log("All films have posters!");
    return;
  }

  const stats = {
    tmdb: 0,
    omdb: 0,
    fanart: 0,
    scraper: 0,
    source_image: 0,  // Scraped images for non-film content
    placeholder: 0,
    failed: 0,
  };

  for (const film of filmsWithoutPosters) {
    try {
      console.log(`Searching for: ${film.title} (${film.year || "?"})...`);

      const result = await posterService.findPoster({
        title: film.title,
        year: film.year ?? undefined,
        imdbId: film.imdbId ?? undefined,
        tmdbId: film.tmdbId ?? undefined,
        contentType: film.contentType ?? "film",
        scraperPosterUrl: film.sourceImageUrl ?? undefined,
      });

      // Update the film with the found poster
      await db
        .update(films)
        .set({
          posterUrl: result.url,
          updatedAt: new Date(),
        })
        .where(eq(films.id, film.id));

      // Track stats
      stats[result.source]++;

      const sourceLabel = result.source === "placeholder"
        ? "Generated placeholder"
        : result.source.toUpperCase();

      console.log(`  ✓ ${sourceLabel}: ${result.url.substring(0, 60)}...`);

      // Rate limiting
      await new Promise((r) => setTimeout(r, 300));
    } catch (error) {
      console.error(`  ✗ Error: ${error}`);
      stats.failed++;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("Results:");
  console.log(`  TMDB:         ${stats.tmdb}`);
  console.log(`  OMDB:         ${stats.omdb}`);
  console.log(`  Fanart.tv:    ${stats.fanart}`);
  console.log(`  Scraper:      ${stats.scraper}`);
  console.log(`  Source Image: ${stats.source_image}`);
  console.log(`  Placeholder:  ${stats.placeholder}`);
  console.log(`  Failed:       ${stats.failed}`);
  console.log("=".repeat(50));
}

// Also provide a function to re-check all placeholders
async function recheckPlaceholders() {
  console.log("🔄 Re-checking films with placeholder posters...\n");

  const posterService = getPosterService();

  // Find films with placeholder posters
  const placeholderFilms = await db
    .select()
    .from(films)
    .where(
      eq(films.posterUrl, "")  // Or check for placeholder URL pattern
    );

  console.log(`Found ${placeholderFilms.length} films with placeholders\n`);

  let upgraded = 0;

  for (const film of placeholderFilms) {
    try {
      const result = await posterService.findPoster({
        title: film.title,
        year: film.year ?? undefined,
        imdbId: film.imdbId ?? undefined,
        tmdbId: film.tmdbId ?? undefined,
        contentType: film.contentType ?? "film",
        scraperPosterUrl: film.sourceImageUrl ?? undefined,
      });

      // Only update if we found a real poster (not a placeholder)
      if (result.source !== "placeholder") {
        await db
          .update(films)
          .set({
            posterUrl: result.url,
            updatedAt: new Date(),
          })
          .where(eq(films.id, film.id));

        console.log(`  ✓ Upgraded: ${film.title} -> ${result.source.toUpperCase()}`);
        upgraded++;
      }

      await new Promise((r) => setTimeout(r, 300));
    } catch (error) {
      console.error(`  ✗ Error for ${film.title}: ${error}`);
    }
  }

  console.log(`\nUpgraded ${upgraded} films from placeholders to real posters.`);
}

// Main execution
const command = process.argv[2];

if (command === "recheck") {
  recheckPlaceholders()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
} else {
  enrichPosters()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}
