/**
 * Cleanup duplicate screenings in the database
 *
 * Duplicates can occur when:
 * 1. Same film+cinema+datetime exists multiple times (rare, should be blocked by unique index)
 * 2. Same screening was scraped with different film IDs (duplicate films)
 *
 * This script:
 * 1. Finds all duplicate screenings (same film title + cinema + datetime)
 * 2. Keeps the oldest screening (first scraped)
 * 3. Deletes the newer duplicates
 */

import { db } from "../src/db";
import { screenings } from "../src/db/schema";
import { sql, inArray } from "drizzle-orm";

interface DuplicateGroup {
  filmTitle: string;
  cinemaId: string;
  datetime: Date;
  screeningIds: string[];
  filmIds: string[];
}

interface DuplicateRow {
  screening_id: string;
  film_id: string;
  film_title: string;
  cinema_id: string;
  datetime: string | Date;
  scraped_at: string | Date | null;
}

async function findDuplicates(): Promise<DuplicateGroup[]> {
  console.log("Finding duplicate screenings using SQL...\n");

  // Use SQL to find duplicates efficiently
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

  // Group the results - handle both array and rows format
  const rows = Array.isArray(duplicateGroups)
    ? duplicateGroups
    : ("rows" in (duplicateGroups as { rows?: DuplicateRow[] })
        ? (duplicateGroups as { rows?: DuplicateRow[] }).rows
        : []) || [];
  console.log(`Found ${rows.length} rows in duplicate query`);

  const groups = new Map<string, DuplicateRow[]>();
  for (const row of rows as DuplicateRow[]) {
    const datetimeValue = row.datetime instanceof Date ? row.datetime.toISOString() : String(row.datetime);
    const key = `${row.film_title}|${row.cinema_id}|${datetimeValue}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(row);
  }

  // Convert to DuplicateGroup format
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

  return duplicates;
}

async function cleanupDuplicates(dryRun = true): Promise<void> {
  const duplicates = await findDuplicates();

  console.log(`Found ${duplicates.length} groups of duplicate screenings\n`);

  if (duplicates.length === 0) {
    console.log("No duplicates to clean up!");
    return;
  }

  // Show sample duplicates
  console.log("Sample duplicates:");
  for (const dup of duplicates.slice(0, 5)) {
    console.log(`  ${dup.filmTitle} @ ${dup.cinemaId} @ ${dup.datetime.toISOString()}`);
    console.log(`    Screening IDs: ${dup.screeningIds.length}`);
    console.log(`    Film IDs: ${dup.filmIds.length} unique`);
  }

  if (duplicates.length > 5) {
    console.log(`  ... and ${duplicates.length - 5} more\n`);
  }

  // Calculate IDs to delete (keep first, delete rest)
  const idsToDelete: string[] = [];
  for (const dup of duplicates) {
    // Keep the first (oldest by scrapedAt due to orderBy)
    const toDelete = dup.screeningIds.slice(1);
    idsToDelete.push(...toDelete);
  }

  console.log(`\nTotal screenings to delete: ${idsToDelete.length}`);

  if (dryRun) {
    console.log("\n[DRY RUN] No changes made. Run with --execute to delete duplicates.");
    return;
  }

  // Delete in batches
  const batchSize = 100;
  let deleted = 0;

  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const batch = idsToDelete.slice(i, i + batchSize);
    await db.delete(screenings).where(inArray(screenings.id, batch));
    deleted += batch.length;
    console.log(`Deleted ${deleted}/${idsToDelete.length} duplicate screenings...`);
  }

  console.log(`\n✅ Cleanup complete! Deleted ${deleted} duplicate screenings.`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");

  if (dryRun) {
    console.log("Running in DRY RUN mode (use --execute to actually delete)\n");
  } else {
    console.log("⚠️  Running in EXECUTE mode - duplicates will be deleted!\n");
  }

  await cleanupDuplicates(dryRun);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
