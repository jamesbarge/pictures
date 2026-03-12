/**
 * Cleanup duplicate screenings in the database
 *
 * Finds duplicates via two strategies:
 * 1. Exact duplicates: same film title + cinema + datetime (different film IDs)
 * 2. Near-duplicates: same (filmId, cinemaId) with datetimes within 2 minutes
 *    (caused by sub-minute timestamp drift across scrapers)
 *
 * For each group: keeps the row with most recent scrapedAt, deletes the rest.
 *
 * Usage:
 *   npx tsx scripts/cleanup-duplicate-screenings.ts              # dry run (default)
 *   npx tsx scripts/cleanup-duplicate-screenings.ts --execute     # actually delete
 */

import { db } from "../src/db";
import { screenings } from "../src/db/schema";
import { sql, inArray } from "drizzle-orm";

const isDryRun = !process.argv.includes("--execute");

// -- Types -------------------------------------------------------------------

interface DuplicateRow {
  screening_id: string;
  film_id: string;
  film_title: string;
  cinema_id: string;
  datetime: string | Date;
  scraped_at: string | Date | null;
}

interface DuplicateGroup {
  filmTitle: string;
  cinemaId: string;
  datetime: Date;
  screeningIds: string[];
  filmIds: string[];
}

interface NearDuplicatePair {
  id1: string;
  id2: string;
  filmTitle: string;
  cinemaName: string;
  dt1: Date;
  dt2: Date;
  scrapedAt1: Date;
  scrapedAt2: Date;
  diffSeconds: number;
}

// -- Strategy 1: Exact duplicates (same title + cinema + datetime) -----------

async function findExactDuplicates(): Promise<DuplicateGroup[]> {
  console.log("=== Strategy 1: Exact-datetime duplicates ===\n");

  const duplicateGroups = await db.execute(sql`
    WITH duplicate_keys AS (
      SELECT
        f.title as film_title,
        s.cinema_id,
        s.datetime,
        COUNT(*) as cnt
      FROM screenings s
      JOIN films f ON s.film_id = f.id
      WHERE s.datetime > NOW()
      GROUP BY f.title, s.cinema_id, s.datetime
      HAVING COUNT(*) > 1
    )
    SELECT
      s.id as screening_id,
      s.film_id,
      f.title as film_title,
      s.cinema_id,
      s.datetime,
      s.scraped_at
    FROM screenings s
    JOIN films f ON s.film_id = f.id
    JOIN duplicate_keys dk ON
      f.title = dk.film_title
      AND s.cinema_id = dk.cinema_id
      AND s.datetime = dk.datetime
    ORDER BY f.title, s.cinema_id, s.datetime, s.scraped_at
  `);

  const rows = Array.isArray(duplicateGroups)
    ? duplicateGroups
    : ("rows" in (duplicateGroups as { rows?: DuplicateRow[] })
        ? (duplicateGroups as { rows?: DuplicateRow[] }).rows
        : []) || [];

  const groups = new Map<string, DuplicateRow[]>();
  for (const row of rows as DuplicateRow[]) {
    const datetimeValue = row.datetime instanceof Date ? row.datetime.toISOString() : String(row.datetime);
    const key = `${row.film_title}|${row.cinema_id}|${datetimeValue}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(row);
  }

  const duplicates: DuplicateGroup[] = [];
  for (const [key, group] of groups) {
    const [filmTitle, cinemaId, datetime] = key.split("|");
    duplicates.push({
      filmTitle,
      cinemaId,
      datetime: new Date(datetime),
      screeningIds: group.map((s) => s.screening_id),
      filmIds: [...new Set(group.map((s) => s.film_id))],
    });
  }

  console.log(`Found ${duplicates.length} exact-duplicate groups`);
  return duplicates;
}

// -- Strategy 2: Near-duplicates (same filmId+cinemaId, ±2min) ---------------

async function findNearDuplicates(): Promise<NearDuplicatePair[]> {
  console.log("\n=== Strategy 2: Near-duplicate screenings (±2 min) ===\n");

  const result = await db.execute(sql`
    SELECT
      s1.id AS id1,
      s2.id AS id2,
      f.title AS film_title,
      c.name AS cinema_name,
      s1.datetime AS dt1,
      s2.datetime AS dt2,
      s1.scraped_at AS scraped_at1,
      s2.scraped_at AS scraped_at2,
      ABS(EXTRACT(EPOCH FROM (s2.datetime - s1.datetime))) AS diff_seconds
    FROM screenings s1
    JOIN screenings s2
      ON s1.film_id = s2.film_id
      AND s1.cinema_id = s2.cinema_id
      AND s1.id < s2.id
      AND ABS(EXTRACT(EPOCH FROM (s2.datetime - s1.datetime))) < 120
      AND s1.datetime != s2.datetime
    JOIN films f ON f.id = s1.film_id
    JOIN cinemas c ON c.id = s1.cinema_id
    WHERE s1.datetime >= NOW()
    ORDER BY c.name, f.title, s1.datetime
  `);

  const rows = result as unknown as Record<string, unknown>[];

  const pairs: NearDuplicatePair[] = rows.map((r) => ({
    id1: r.id1 as string,
    id2: r.id2 as string,
    filmTitle: r.film_title as string,
    cinemaName: r.cinema_name as string,
    dt1: new Date(r.dt1 as string),
    dt2: new Date(r.dt2 as string),
    scrapedAt1: new Date(r.scraped_at1 as string),
    scrapedAt2: new Date(r.scraped_at2 as string),
    diffSeconds: Number(r.diff_seconds),
  }));

  console.log(`Found ${pairs.length} near-duplicate pairs`);
  return pairs;
}

// -- Main --------------------------------------------------------------------

async function main() {
  console.log(`Mode: ${isDryRun ? "DRY RUN" : "EXECUTE"}\n`);

  const idsToDelete = new Set<string>();

  // Strategy 1: Exact duplicates
  const exactDupes = await findExactDuplicates();
  for (const dup of exactDupes) {
    console.log(`  "${dup.filmTitle}" @ ${dup.cinemaId} @ ${dup.datetime.toISOString()} (${dup.screeningIds.length} copies, ${dup.filmIds.length} film IDs)`);
    // Keep first (oldest by scrapedAt), delete rest
    for (const id of dup.screeningIds.slice(1)) {
      idsToDelete.add(id);
    }
  }

  // Strategy 2: Near-duplicates
  const nearDupes = await findNearDuplicates();
  for (const pair of nearDupes) {
    // Keep the one with more recent scrapedAt
    const keepId = pair.scrapedAt1 >= pair.scrapedAt2 ? pair.id1 : pair.id2;
    const deleteId = keepId === pair.id1 ? pair.id2 : pair.id1;
    const keepDt = keepId === pair.id1 ? pair.dt1 : pair.dt2;
    const deleteDt = keepId === pair.id1 ? pair.dt2 : pair.dt1;

    console.log(`  "${pair.filmTitle}" at ${pair.cinemaName} (diff: ${pair.diffSeconds}s)`);
    console.log(`    KEEP:   ${keepId} @ ${keepDt.toISOString()}`);
    console.log(`    DELETE: ${deleteId} @ ${deleteDt.toISOString()}`);

    idsToDelete.add(deleteId);
  }

  const deleteList = Array.from(idsToDelete);
  console.log(`\nTotal screenings to delete: ${deleteList.length}`);

  if (deleteList.length === 0) {
    console.log("No duplicates to clean up!");
    process.exit(0);
  }

  if (isDryRun) {
    console.log("\n[DRY RUN] No changes made. Use --execute to delete.");
  } else {
    // Delete in batches
    const batchSize = 100;
    let deleted = 0;

    for (let i = 0; i < deleteList.length; i += batchSize) {
      const batch = deleteList.slice(i, i + batchSize);
      await db.delete(screenings).where(inArray(screenings.id, batch));
      deleted += batch.length;
      console.log(`Deleted ${deleted}/${deleteList.length} duplicate screenings...`);
    }

    console.log(`\nCleanup complete! Deleted ${deleted} duplicate screenings.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
