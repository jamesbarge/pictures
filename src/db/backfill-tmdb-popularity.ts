/**
 * Backfill TMDB popularity for films that already have a TMDB ID.
 * Uses the TMDB movie details endpoint directly instead of full re-enrichment.
 */

import { db } from "./index";
import { films } from "./schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getTMDBClient } from "@/lib/tmdb";

const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number.parseInt(limitArg.split("=")[1] ?? "", 10) : undefined;
const RATE_LIMIT_MS = 250;

async function backfillTmdbPopularity() {
  const client = getTMDBClient();

  const query = db
    .select({
      id: films.id,
      title: films.title,
      tmdbId: films.tmdbId,
    })
    .from(films)
    .where(and(isNotNull(films.tmdbId), isNull(films.tmdbPopularity)));

  const rows = LIMIT ? await query.limit(LIMIT) : await query;

  console.log(`Found ${rows.length} films missing TMDB popularity${DRY_RUN ? " (dry run)" : ""}\n`);

  let updated = 0;
  let skipped = 0;

  for (const film of rows) {
    if (film.tmdbId == null) {
      skipped++;
      continue;
    }

    try {
      const details = await client.getFilmDetails(film.tmdbId);
      console.log(`${DRY_RUN ? "[dry-run] " : ""}${film.title} -> popularity ${details.popularity}`);

      if (!DRY_RUN) {
        await db
          .update(films)
          .set({
            tmdbPopularity: details.popularity,
            updatedAt: new Date(),
          })
          .where(eq(films.id, film.id));
      }

      updated++;
    } catch (error) {
      skipped++;
      console.error(`Failed to backfill TMDB popularity for "${film.title}" (${film.tmdbId}):`, error);
    }

    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
  }

  console.log(`\nUpdated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  if (DRY_RUN) console.log("No changes written.");
}

const isDirectRun =
  process.argv[1]?.endsWith("backfill-tmdb-popularity.ts") ||
  process.argv[1]?.endsWith("backfill-tmdb-popularity.js");

if (isDirectRun) {
  backfillTmdbPopularity()
    .then(() => {
      console.log("\nDone!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
