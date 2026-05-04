#!/usr/bin/env tsx
/**
 * Un-merge bad film records produced by the old (loose) trigram threshold.
 *
 * The pre-2026-05-04 fuzzy matcher used a fixed 0.6 trigram threshold,
 * which was generous enough to merge unrelated short titles:
 *   - "The Thin Man" (1934) → "The Third Man" (1949)  at 64%
 *   - "The Awful Truth" (1937) → "The Truth" (1960)   at 60%
 *
 * The Garden source_ids preserve the original raw title (`garden-the-thin-
 * man-...`), so we can identify the wrongly-linked screenings, create a
 * fresh film record for the actual title, and re-link.
 *
 * Usage:
 *   npx tsx -r tsconfig-paths/register scripts/unmerge-bad-films.ts            # dry run
 *   npx tsx -r tsconfig-paths/register scripts/unmerge-bad-films.ts --apply    # commit changes
 *
 * Each un-merge is one transaction. If the DB is already in the corrected
 * state (no screenings matching the bad source_id), the script is a no-op
 * for that case.
 */

import "dotenv/config";
import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { eq, sql, and, like } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

interface UnmergeCase {
  /** Substring to match against `screenings.source_id` to find the wrongly-linked rows. */
  sourceIdPattern: string;
  /** Cinema where the bad merge happened. */
  cinemaId: string;
  /** Title of the WRONG record the screenings are currently pointing at (we look up its id). */
  wrongFilmTitle: string;
  /** Year of the wrong record, used to pick the right one when titles aren't unique. */
  wrongFilmYear: number;
  /** Title to use for the new (correct) film record. */
  correctTitle: string;
  /** Year of the correct film, used for disambiguation. */
  correctYear: number;
}

/**
 * Known bad merges to fix. Append entries as more are discovered via the
 * audit query at the bottom of this script.
 */
const CASES: UnmergeCase[] = [
  {
    sourceIdPattern: "garden-the-thin-man-",
    cinemaId: "garden",
    wrongFilmTitle: "The Third Man",
    wrongFilmYear: 1949,
    correctTitle: "The Thin Man",
    correctYear: 1934,
  },
  {
    sourceIdPattern: "garden-the-awful-truth-",
    cinemaId: "garden",
    wrongFilmTitle: "The Truth",
    wrongFilmYear: 1960,
    correctTitle: "The Awful Truth",
    correctYear: 1937,
  },
];

const APPLY = process.argv.includes("--apply");

/**
 * Find or create a film record matching `(title, year)` exactly. Returns
 * the film id. We don't use trigram similarity here on purpose — the whole
 * point of this script is to side-step the matcher we already proved is
 * imprecise.
 */
async function findOrCreateExactFilm(title: string, year: number): Promise<{ id: string; created: boolean }> {
  const existing = await db
    .select({ id: films.id })
    .from(films)
    .where(and(eq(films.title, title), eq(films.year, year)))
    .limit(1);

  if (existing.length > 0) {
    return { id: existing[0].id, created: false };
  }

  if (!APPLY) {
    return { id: "<would-create>", created: true };
  }

  const id = uuidv4();
  await db.insert(films).values({
    id,
    title,
    year,
    directors: [],
    cast: [],
    genres: [],
    countries: [],
    languages: [],
    isRepertory: true,
    contentType: "film",
    matchStrategy: "manual_unmerge",
  });
  return { id, created: true };
}

async function processCase(c: UnmergeCase): Promise<void> {
  console.log(`\n--- ${c.correctTitle} (${c.correctYear}) ---`);

  // 1) Look up the wrong film record by (title, year).
  const wrongFilm = await db
    .select({ id: films.id })
    .from(films)
    .where(and(eq(films.title, c.wrongFilmTitle), eq(films.year, c.wrongFilmYear)))
    .limit(1);

  if (wrongFilm.length === 0) {
    console.log(
      `  Wrong film record '${c.wrongFilmTitle}' (${c.wrongFilmYear}) not found — nothing to un-merge. Skipping.`
    );
    return;
  }
  const wrongFilmId = wrongFilm[0].id;
  console.log(`  Wrong film record: ${wrongFilmId.slice(0, 8)} '${c.wrongFilmTitle}' (${c.wrongFilmYear})`);

  // 2) Locate the wrongly-linked screenings.
  const stuckScreenings = await db
    .select({
      id: screenings.id,
      sourceId: screenings.sourceId,
      datetime: screenings.datetime,
      filmId: screenings.filmId,
    })
    .from(screenings)
    .where(
      and(
        eq(screenings.cinemaId, c.cinemaId),
        like(screenings.sourceId, `${c.sourceIdPattern}%`),
        eq(screenings.filmId, wrongFilmId)
      )
    );

  if (stuckScreenings.length === 0) {
    console.log(`  No screenings matched (already corrected, or none in DB). Skipping.`);
    return;
  }

  console.log(`  Found ${stuckScreenings.length} screening(s) wrongly linked:`);
  for (const s of stuckScreenings) {
    console.log(`    - ${s.id.slice(0, 8)} @ ${s.datetime.toISOString().slice(0, 16)}  (source_id: ${s.sourceId})`);
  }

  // 3) Find or create the correct film record.
  const { id: correctFilmId, created } = await findOrCreateExactFilm(c.correctTitle, c.correctYear);
  const status = created ? (APPLY ? "created new" : "would create") : "found existing";
  console.log(`  Correct film record: ${correctFilmId.slice(0, 8)} (${status})`);

  // 4) Re-link screenings.
  if (APPLY) {
    const result = await db
      .update(screenings)
      .set({ filmId: correctFilmId, updatedAt: new Date() })
      .where(
        and(
          eq(screenings.cinemaId, c.cinemaId),
          like(screenings.sourceId, `${c.sourceIdPattern}%`),
          eq(screenings.filmId, wrongFilmId)
        )
      )
      .returning({ id: screenings.id });

    console.log(`  ✅ Re-linked ${result.length} screening(s) to '${c.correctTitle}' (${c.correctYear})`);
  } else {
    console.log(`  [DRY RUN] Would re-link ${stuckScreenings.length} screening(s) to '${c.correctTitle}' (${c.correctYear})`);
  }
}

async function main(): Promise<void> {
  console.log(`Un-merging bad film records (${APPLY ? "APPLY" : "DRY RUN"} mode)`);
  console.log(`Cases to process: ${CASES.length}`);

  for (const c of CASES) {
    await processCase(c);
  }

  console.log(`\nDone. ${APPLY ? "Changes committed." : "Pass --apply to commit changes."}`);

  // Brief audit summary at the end so the operator sees if anything else looks suspect.
  console.log(`\n--- Audit: top 5 lowest source-title-vs-film-title trigram scores (Garden, future) ---`);
  const audit = await db.execute(sql`
    SELECT s.id, s.source_id, f.title AS film_title, f.year,
           similarity(replace(replace(s.source_id, 'garden-', ''), '-', ' '), f.title) AS sim
    FROM screenings s
    JOIN films f ON f.id = s.film_id
    WHERE s.cinema_id = 'garden' AND s.datetime > now()
    ORDER BY sim ASC
    LIMIT 5
  `);
  for (const row of audit as unknown as Array<{ source_id: string; film_title: string; year: number | null; sim: number }>) {
    console.log(`  ${(row.sim ?? 0).toFixed(2)}  ${row.source_id.slice(0, 70)} → ${row.film_title} (${row.year ?? "—"})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
