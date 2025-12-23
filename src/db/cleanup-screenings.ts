/**
 * Screening Cleanup Script
 *
 * Identifies and removes duplicate screenings (same film, cinema, datetime).
 * Keeps the oldest record (by scrapedAt) or the one with the most complete data.
 *
 * Run with:
 *   npm run db:cleanup-screenings           # Dry run - see count
 *   npm run db:cleanup-screenings --execute # Actually delete
 */

import { db } from "@/db";
import { screenings } from "@/db/schema";
import { sql, inArray } from "drizzle-orm";

async function cleanupDuplicateScreenings() {
  console.log("Finding duplicate screenings...\n");

  // Find all duplicate groups using SQL window function
  // Keeps the one with booking_url (if available) and earliest scraped_at
  const duplicates = await db.execute(sql`
    WITH ranked AS (
      SELECT
        id,
        film_id,
        cinema_id,
        datetime,
        scraped_at,
        booking_url,
        ROW_NUMBER() OVER (
          PARTITION BY film_id, cinema_id, datetime
          ORDER BY
            CASE WHEN booking_url IS NOT NULL AND booking_url != '' THEN 0 ELSE 1 END,
            scraped_at ASC
        ) as rn,
        COUNT(*) OVER (PARTITION BY film_id, cinema_id, datetime) as cnt
      FROM screenings
    )
    SELECT id, film_id, cinema_id, datetime, cnt
    FROM ranked
    WHERE rn > 1
  `);

  // Drizzle execute returns QueryResult with rows property
  const result = duplicates as unknown as { rows?: Array<Record<string, unknown>> };
  const toDelete = (result.rows ?? []) as Array<{
    id: string;
    film_id: string;
    cinema_id: string;
    datetime: Date;
    cnt: number;
  }>;

  console.log(`Found ${toDelete.length} duplicate screenings to remove\n`);

  if (toDelete.length === 0) {
    console.log("No duplicates found!");
    return;
  }

  // Preview first 10
  console.log("Sample duplicates to be removed:");
  for (const dup of toDelete.slice(0, 10)) {
    console.log(
      `  - ID: ${dup.id.slice(0, 8)}..., Film: ${dup.film_id.slice(0, 8)}..., Cinema: ${dup.cinema_id.slice(0, 8)}..., Time: ${dup.datetime}, (${dup.cnt} copies)`
    );
  }

  if (toDelete.length > 10) {
    console.log(`  ... and ${toDelete.length - 10} more`);
  }

  // Dry run by default
  const isDryRun = !process.argv.includes("--execute");

  if (isDryRun) {
    console.log(
      "\n DRY RUN - No changes made. Run with --execute to delete duplicates."
    );
    return;
  }

  // Delete duplicates in batches
  console.log("\nDeleting duplicates...");
  const batchSize = 100;
  let deleted = 0;

  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = toDelete.slice(i, i + batchSize);
    const ids = batch.map((d) => d.id);

    await db.delete(screenings).where(inArray(screenings.id, ids));

    deleted += batch.length;
    if (deleted % 500 === 0 || deleted === toDelete.length) {
      console.log(`  Deleted ${deleted}/${toDelete.length}...`);
    }
  }

  console.log(`\nCleanup complete: ${deleted} duplicate screenings removed`);
}

cleanupDuplicateScreenings()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
