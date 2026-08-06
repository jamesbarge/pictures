/**
 * Backfill TMDB vote_count for films that already have a TMDB ID.
 *
 * vote_count is the obscurity signal for THE SLEEPER: high Letterboxd rating +
 * low vote count = acclaimed but under-seen. It has always been present in the
 * TMDB details response but was never persisted, so every pre-existing row
 * needs filling once. New rows get it at write time (see film-matching.ts and
 * the enrichment scripts).
 *
 * Resumable for free: the `isNull(films.tmdbVoteCount)` predicate means a
 * re-run after a crash picks up exactly what is still missing.
 *
 * Mirrors backfill-tmdb-popularity.ts deliberately — same flags, same rate
 * limit, same direct-run guard.
 */

import { db } from "./index";
import { films } from "./schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getTMDBClient } from "@/lib/tmdb";

const DRY_RUN = !process.argv.includes("--execute");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number.parseInt(limitArg.split("=")[1] ?? "", 10) : undefined;
const RATE_LIMIT_MS = 250;

async function backfillTmdbVoteCount() {
  const client = getTMDBClient();

  const query = db
    .select({
      id: films.id,
      title: films.title,
      tmdbId: films.tmdbId,
    })
    .from(films)
    .where(and(isNotNull(films.tmdbId), isNull(films.tmdbVoteCount)));

  const rows = LIMIT ? await query.limit(LIMIT) : await query;

  console.log(`Found ${rows.length} films missing TMDB vote count${DRY_RUN ? " (dry run)" : ""}\n`);

  let updated = 0;
  let skipped = 0;

  for (const film of rows) {
    if (film.tmdbId == null) {
      skipped++;
      continue;
    }

    try {
      // getFilmDetails returns the details object directly — NOT nested under
      // `.details` the way getFullFilmData does.
      const details = await client.getFilmDetails(film.tmdbId);
      console.log(`${DRY_RUN ? "[dry-run] " : ""}${film.title} -> ${details.vote_count} votes`);

      if (!DRY_RUN) {
        await db
          .update(films)
          .set({
            tmdbVoteCount: details.vote_count,
            updatedAt: new Date(),
          })
          .where(eq(films.id, film.id));
      }

      updated++;
    } catch (error) {
      skipped++;
      console.error(`Failed to backfill TMDB vote count for "${film.title}" (${film.tmdbId}):`, error);
    }

    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
  }

  console.log(`\nUpdated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  if (DRY_RUN) console.log("No changes written.");
}

const isDirectRun =
  process.argv[1]?.endsWith("backfill-tmdb-vote-count.ts") ||
  process.argv[1]?.endsWith("backfill-tmdb-vote-count.js");

if (isDirectRun) {
  backfillTmdbVoteCount()
    .then(() => {
      console.log("\nDone!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
