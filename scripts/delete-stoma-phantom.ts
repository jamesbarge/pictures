#!/usr/bin/env tsx
/**
 * Delete the phantom Stoma screening that was wrongly linked to Guo Ran.
 *
 * Background:
 *   Garden's "Remind film festival presents Stoma" screening on 2026-05-17
 *   18:00 was scraped on 2026-04-29 and linked to the wrong film (Guo Ran).
 *   On 2026-05-05 the scraper ran again, correctly matched to Stoma, but
 *   inserted a NEW row instead of updating the old one (the screenings
 *   table has no unique constraint on (cinema_id, source_id, datetime)).
 *
 *   Result: two rows with identical source_id+cinema+datetime, one wrong
 *   (Guo Ran), one correct (Stoma). The wrong row is a phantom — Garden
 *   never actually scheduled Guo Ran at that slot.
 *
 * Safety: this script only deletes if all of the following hold:
 *   1. The target row id matches exactly.
 *   2. The target row's film_title is 'Guo Ran'.
 *   3. There is at least one OTHER row with the same source_id, cinema, and
 *      datetime, linked to a film titled 'Stoma'.
 *   4. Source_id contains the substring 'stoma' (sanity).
 *
 * Run dry by default; pass --apply to commit.
 */
import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

const TARGET_ID = "cbcdfce0-94c1-4a7c-bde2-da4fa86a3889";
const EXPECTED_WRONG_FILM_TITLE = "Guo Ran";
const EXPECTED_CORRECT_FILM_TITLE = "Stoma";
const REQUIRED_SOURCE_SUBSTR = "stoma";

async function main(): Promise<void> {
  console.log(`Stoma phantom deletion (${APPLY ? "APPLY" : "DRY RUN"} mode)`);

  // 1) Read the target row + its current film.
  const targetRows = await db
    .select({
      id: screenings.id,
      cinemaId: screenings.cinemaId,
      sourceId: screenings.sourceId,
      datetime: screenings.datetime,
      filmId: screenings.filmId,
      filmTitle: films.title,
    })
    .from(screenings)
    .leftJoin(films, eq(films.id, screenings.filmId))
    .where(eq(screenings.id, TARGET_ID))
    .limit(1);

  if (targetRows.length === 0) {
    console.log(`  Target row ${TARGET_ID} does not exist — already cleaned up. Exiting.`);
    process.exit(0);
  }
  const target = targetRows[0];
  console.log(`  Target row:`, target);

  // 2) Check guards.
  if (target.filmTitle !== EXPECTED_WRONG_FILM_TITLE) {
    console.error(
      `  ABORT: target row's film title is '${target.filmTitle}', expected '${EXPECTED_WRONG_FILM_TITLE}'.`
    );
    process.exit(1);
  }
  if (!target.sourceId || !target.sourceId.toLowerCase().includes(REQUIRED_SOURCE_SUBSTR)) {
    console.error(
      `  ABORT: target row's source_id ('${target.sourceId}') does not contain '${REQUIRED_SOURCE_SUBSTR}'.`
    );
    process.exit(1);
  }

  // 3) Confirm a sibling correct row exists (same source_id+cinema+datetime, different id, film title = 'Stoma').
  const siblings = await db
    .select({
      id: screenings.id,
      filmId: screenings.filmId,
      filmTitle: films.title,
    })
    .from(screenings)
    .leftJoin(films, eq(films.id, screenings.filmId))
    .where(
      and(
        eq(screenings.cinemaId, target.cinemaId),
        eq(screenings.sourceId, target.sourceId),
        eq(screenings.datetime, target.datetime),
        ne(screenings.id, target.id)
      )
    );
  console.log(`  Sibling rows with same (cinema, source_id, datetime):`);
  for (const s of siblings) {
    console.log(`    - ${s.id.slice(0, 8)} → ${s.filmTitle ?? "<null>"}`);
  }

  const correctSibling = siblings.find((s) => s.filmTitle === EXPECTED_CORRECT_FILM_TITLE);
  if (!correctSibling) {
    console.error(
      `  ABORT: no sibling row linked to a film titled '${EXPECTED_CORRECT_FILM_TITLE}' — cannot safely delete.`
    );
    process.exit(1);
  }
  console.log(`  ✓ Correct sibling present: ${correctSibling.id.slice(0, 8)} → ${correctSibling.filmTitle}`);

  // 4) Delete (or dry-run).
  if (APPLY) {
    const deleted = await db
      .delete(screenings)
      .where(eq(screenings.id, TARGET_ID))
      .returning({ id: screenings.id });
    console.log(`  ✅ Deleted ${deleted.length} row.`);
  } else {
    console.log(`  [DRY RUN] Would delete row ${TARGET_ID}.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("ERR:", e);
  process.exit(1);
});
