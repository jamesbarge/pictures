/**
 * Cleanup script for BST +1h ghost screenings.
 *
 * Pattern: same (cinema_id, source_id) appearing multiple times with
 * datetimes EXACTLY 1 hour apart. The earliest datetime is the correct
 * one (scraped under London BST → -1h offset applied). Anything later
 * by exactly 1h is the ghost row from a runtime TZ=UTC scrape.
 *
 * The 1-hour-exact constraint is the safety guard: this won't touch
 * screenings that were legitimately re-scheduled by the cinema (which
 * tend to differ by minutes or hours other than exactly 60min).
 *
 * Usage:
 *   npx tsx -r tsconfig-paths/register --env-file=.env.local scripts/_cleanup-bst-ghost-screenings.ts            (dry-run)
 *   npx tsx -r tsconfig-paths/register --env-file=.env.local scripts/_cleanup-bst-ghost-screenings.ts --apply    (apply)
 */

import { db } from "@/db";
import { screenings, cinemas } from "@/db/schema";
import { sql, inArray } from "drizzle-orm";

async function main() {
  const apply = process.argv.includes("--apply");
  const mode = apply ? "APPLY" : "DRY-RUN";
  console.log(`\n=== BST ghost cleanup (${mode}) ===\n`);

  // Identify chain cinema IDs (Everyman + Picturehouse — Curzon is BST-clean)
  const chainCinemas = await db
    .select({ id: cinemas.id, name: cinemas.name })
    .from(cinemas)
    .where(
      sql`(LOWER(${cinemas.name}) LIKE '%everyman%' OR LOWER(${cinemas.name}) LIKE '%picturehouse%' OR ${cinemas.id} = 'screen-on-the-green' OR ${cinemas.id} = 'the-ritzy')`,
    );
  const cinemaIds = chainCinemas.map((c) => c.id);
  console.log(`Scope: ${cinemaIds.length} chain cinemas (Everyman + Picturehouse families)`);

  // Find ghost rows: rows with same (cinema_id, source_id) whose datetime
  // exceeds the MIN within the group by exactly 3600s (= 1h).
  const ghostRows = await db.execute(sql`
    WITH groups AS (
      SELECT
        cinema_id,
        source_id,
        MIN(datetime) AS earliest,
        MAX(datetime) AS latest,
        COUNT(*)::int AS n
      FROM screenings
      WHERE cinema_id = ANY(${sql.raw(`ARRAY[${cinemaIds.map((id) => `'${id}'`).join(",")}]`)})
        AND source_id IS NOT NULL
        AND datetime >= NOW()
      GROUP BY cinema_id, source_id
      HAVING COUNT(*) > 1
        AND EXTRACT(EPOCH FROM (MAX(datetime) - MIN(datetime)))::int = 3600
    )
    SELECT s.id, s.cinema_id, s.source_id, s.datetime, s.scraped_at,
           g.earliest AS keep_datetime
    FROM screenings s
    INNER JOIN groups g ON s.cinema_id = g.cinema_id AND s.source_id = g.source_id
    WHERE s.datetime > g.earliest
    ORDER BY s.cinema_id, s.source_id, s.datetime;
  `);
  const rows = ghostRows as unknown as Array<{
    id: string;
    cinema_id: string;
    source_id: string;
    datetime: Date;
    scraped_at: Date;
    keep_datetime: Date;
  }>;

  // Tally by cinema
  const byCinema = new Map<string, number>();
  for (const r of rows) byCinema.set(r.cinema_id, (byCinema.get(r.cinema_id) ?? 0) + 1);

  console.log(`\nGhost rows to delete: ${rows.length}\n`);
  console.log("By cinema:");
  for (const [cid, n] of [...byCinema.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cid.padEnd(28)} ${n}`);
  }

  console.log(`\nSample (first 5):`);
  for (const r of rows.slice(0, 5)) {
    const keep = new Date(r.keep_datetime).toISOString();
    const drop = new Date(r.datetime).toISOString();
    const scraped = new Date(r.scraped_at).toISOString();
    console.log(`  ${r.cinema_id} src=${r.source_id.slice(0, 40)}…`);
    console.log(`     keep ${keep}, DROP ${drop}  (scraped ${scraped})`);
  }

  if (!apply) {
    console.log(`\n[DRY-RUN] No rows deleted. Re-run with --apply to delete ${rows.length} rows.`);
    process.exit(0);
  }

  // Apply
  console.log(`\n[APPLY] Deleting ${rows.length} rows in batches of 500...`);
  const idsToDelete = rows.map((r) => r.id);
  let deleted = 0;
  while (idsToDelete.length > 0) {
    const batch = idsToDelete.splice(0, 500);
    const result = await db.delete(screenings).where(inArray(screenings.id, batch));
    deleted += batch.length;
    console.log(`  Deleted ${deleted}/${rows.length}`);
  }
  console.log(`\nDone. ${deleted} ghost rows deleted.`);

  // Verify: post-cleanup, the dupe count for these chains should be near zero
  const remaining = await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM (
      SELECT cinema_id, source_id
      FROM screenings
      WHERE cinema_id = ANY(${sql.raw(`ARRAY[${cinemaIds.map((id) => `'${id}'`).join(",")}]`)})
        AND source_id IS NOT NULL
        AND datetime >= NOW()
      GROUP BY cinema_id, source_id
      HAVING COUNT(*) > 1
        AND EXTRACT(EPOCH FROM (MAX(datetime) - MIN(datetime)))::int = 3600
    ) g;
  `);
  const r2 = remaining as unknown as Array<{ n: number }>;
  console.log(`Remaining BST-signature dupe groups: ${r2[0]?.n ?? 0}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
