/**
 * Cleanup duplicate films in the database
 *
 * This script:
 * 1. Finds films with identical normalized titles AND same year (or both null year)
 * 2. Merges screenings from duplicate to primary film
 * 3. Deletes the duplicate film record
 */

import { db } from "../src/db";
import { films, screenings } from "../src/db/schema";
import { sql, eq } from "drizzle-orm";

interface DuplicatePair {
  id1: string;
  title1: string;
  year1: number | null;
  id2: string;
  title2: string;
  year2: number | null;
}

async function findDuplicateFilms(): Promise<DuplicatePair[]> {
  console.log("Finding duplicate films...\n");

  const result = await db.execute(sql`
    WITH normalized_films AS (
      SELECT
        id,
        title,
        year,
        LOWER(REGEXP_REPLACE(title, '[^a-zA-Z0-9]', '', 'g')) as normalized_title
      FROM films
    )
    SELECT
      f1.id as id1,
      f1.title as title1,
      f1.year as year1,
      f2.id as id2,
      f2.title as title2,
      f2.year as year2
    FROM normalized_films f1
    JOIN normalized_films f2 ON
      f1.normalized_title = f2.normalized_title
      AND f1.id < f2.id
      AND (f1.year = f2.year OR (f1.year IS NULL AND f2.year IS NULL))
    LIMIT 50
  `);

  const rows = Array.isArray(result)
    ? result
    : ("rows" in (result as { rows?: DuplicatePair[] })
        ? (result as { rows?: DuplicatePair[] }).rows
        : []) || [];
  return rows as DuplicatePair[];
}

async function getScreeningCount(filmId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(screenings)
    .where(eq(screenings.filmId, filmId));
  return Number(result[0]?.count || 0);
}

async function cleanupDuplicateFilms(dryRun = true): Promise<void> {
  const duplicates = await findDuplicateFilms();

  console.log(`Found ${duplicates.length} pairs of duplicate films\n`);

  if (duplicates.length === 0) {
    console.log("No duplicates to clean up!");
    return;
  }

  let totalMerged = 0;
  const filmsToDelete: string[] = [];

  for (const dup of duplicates) {
    const count1 = await getScreeningCount(dup.id1);
    const count2 = await getScreeningCount(dup.id2);

    // Keep the one with more screenings, or the first one if equal
    const keepId = count1 >= count2 ? dup.id1 : dup.id2;
    const deleteId = count1 >= count2 ? dup.id2 : dup.id1;
    const keepTitle = count1 >= count2 ? dup.title1 : dup.title2;
    const deleteTitle = count1 >= count2 ? dup.title2 : dup.title1;
    const keepCount = count1 >= count2 ? count1 : count2;
    const deleteCount = count1 >= count2 ? count2 : count1;

    console.log(`Duplicate: "${dup.title1}" (${dup.year1 ?? "no year"})`);
    console.log(`  Keep: "${keepTitle}" (${keepCount} screenings) [${keepId}]`);
    console.log(`  Delete: "${deleteTitle}" (${deleteCount} screenings) [${deleteId}]`);

    if (deleteCount > 0) {
      console.log(`  → Will move ${deleteCount} screenings to kept film`);
      totalMerged += deleteCount;
    }
    console.log();

    filmsToDelete.push(deleteId);
  }

  console.log(`\nSummary:`);
  console.log(`  Films to delete: ${filmsToDelete.length}`);
  console.log(`  Screenings to merge: ${totalMerged}`);

  if (dryRun) {
    console.log("\n[DRY RUN] No changes made. Run with --execute to clean up duplicates.");
    return;
  }

  // Execute the merges
  console.log("\nExecuting cleanup...");

  for (const dup of duplicates) {
    const count1 = await getScreeningCount(dup.id1);
    const count2 = await getScreeningCount(dup.id2);
    const keepId = count1 >= count2 ? dup.id1 : dup.id2;
    const deleteId = count1 >= count2 ? dup.id2 : dup.id1;

    // Move screenings
    await db
      .update(screenings)
      .set({ filmId: keepId })
      .where(eq(screenings.filmId, deleteId));

    // Delete duplicate film
    await db.delete(films).where(eq(films.id, deleteId));

    console.log(`  Merged and deleted: ${dup.title1}`);
  }

  console.log(`\n✅ Cleanup complete! Deleted ${filmsToDelete.length} duplicate films.`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");

  if (dryRun) {
    console.log("Running in DRY RUN mode (use --execute to actually delete)\n");
  } else {
    console.log("⚠️  Running in EXECUTE mode - duplicates will be merged and deleted!\n");
  }

  await cleanupDuplicateFilms(dryRun);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
