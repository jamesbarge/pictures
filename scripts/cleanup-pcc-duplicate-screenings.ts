/**
 * One-time cleanup of time-shift orphan screenings across all cinemas.
 *
 * When a cinema updates a showtime between scraper runs (e.g., 17:15 → 18:15),
 * the pipeline creates a new screening but never removes the old one. This script
 * finds orphans using the same pairwise logic as the pipeline's
 * cleanupSupersededScreenings(): a screening is an orphan if there's another
 * screening for the same film on the same date, within 3 hours, that was scraped
 * more recently.
 *
 * Safety: uses pairwise comparison (not chaining), requires scraped_at difference
 * of at least 5 minutes to avoid catching same-run legitimate showtimes.
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx scripts/cleanup-pcc-duplicate-screenings.ts
 *   npx dotenv -e .env.local -- npx tsx scripts/cleanup-pcc-duplicate-screenings.ts --execute
 *   npx dotenv -e .env.local -- npx tsx scripts/cleanup-pcc-duplicate-screenings.ts --cinema prince-charles
 */

import { db } from "../src/db";
import { screenings } from "../src/db/schema";
import { sql, inArray } from "drizzle-orm";

const isDryRun = !process.argv.includes("--execute");
const cinemaFlag = process.argv.indexOf("--cinema");
const cinemaFilter = cinemaFlag !== -1 ? process.argv[cinemaFlag + 1] : null;

interface OrphanRow {
  orphan_id: string;
  film_title: string;
  cinema_name: string;
  orphan_datetime: Date;
  orphan_scraped_at: Date;
  keeper_datetime: Date;
  keeper_scraped_at: Date;
}

async function main() {
  console.log(`Mode: ${isDryRun ? "DRY RUN" : "EXECUTE"}`);
  if (cinemaFilter) console.log(`Cinema filter: ${cinemaFilter}`);

  // Find orphan screenings using pairwise comparison
  // A screening is an orphan if:
  // 1. It's future-dated
  // 2. There's another screening for the same film at the same cinema on the same London date
  // 3. That other screening is within 3 hours
  // 4. That other screening was scraped at least 5 minutes more recently
  const cinemaWhere = cinemaFilter
    ? sql`AND s.cinema_id = ${cinemaFilter}`
    : sql``;

  const orphans = (await db.execute(sql`
    SELECT DISTINCT ON (s.id)
      s.id AS orphan_id,
      f.title AS film_title,
      c.name AS cinema_name,
      s.datetime AS orphan_datetime,
      s.scraped_at AS orphan_scraped_at,
      s2.datetime AS keeper_datetime,
      s2.scraped_at AS keeper_scraped_at
    FROM screenings s
    JOIN screenings s2
      ON s2.cinema_id = s.cinema_id
      AND s2.film_id = s.film_id
      AND s2.id != s.id
      AND DATE(s2.datetime AT TIME ZONE 'Europe/London') = DATE(s.datetime AT TIME ZONE 'Europe/London')
      AND ABS(EXTRACT(EPOCH FROM s2.datetime - s.datetime)) < 10800
      AND s2.scraped_at > s.scraped_at + INTERVAL '5 minutes'
    JOIN films f ON f.id = s.film_id
    JOIN cinemas c ON c.id = s.cinema_id
    WHERE s.datetime >= NOW()
      ${cinemaWhere}
    ORDER BY s.id, s2.scraped_at DESC
  `)) as OrphanRow[];

  console.log(`\nFound ${orphans.length} orphaned screenings to delete:\n`);

  for (const o of orphans) {
    const orphanTime = new Date(o.orphan_datetime).toISOString().slice(11, 16);
    const keeperTime = new Date(o.keeper_datetime).toISOString().slice(11, 16);
    const orphanDate = new Date(o.orphan_scraped_at).toISOString().slice(0, 10);
    const keeperDate = new Date(o.keeper_scraped_at).toISOString().slice(0, 10);
    console.log(`  "${o.film_title}" @ ${o.cinema_name} | DELETE ${orphanTime} (scraped ${orphanDate}) | KEEP ${keeperTime} (scraped ${keeperDate})`);
  }

  if (orphans.length === 0) {
    console.log("No orphans to clean up!");
    process.exit(0);
  }

  const idsToDelete = orphans.map((o) => o.orphan_id);

  if (isDryRun) {
    console.log(`\n[DRY RUN] No changes made. Use --execute to delete ${idsToDelete.length} screenings.`);
  } else {
    const batchSize = 100;
    let deleted = 0;
    for (let i = 0; i < idsToDelete.length; i += batchSize) {
      const batch = idsToDelete.slice(i, i + batchSize);
      await db.delete(screenings).where(inArray(screenings.id, batch));
      deleted += batch.length;
      console.log(`Deleted ${deleted}/${idsToDelete.length}...`);
    }
    console.log(`\nCleanup complete! Deleted ${deleted} orphaned screenings.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
