#!/usr/bin/env tsx
/**
 * Clean up BFI Southbank "many films at same datetime" bogus rows.
 *
 * Root cause: the programme-changes-parser's `getFollowingText` previously
 * grabbed the entire parent paragraph's text, so when 6+ film entries shared
 * one `<p>`, each film's regex pool contained every sibling's screening
 * times. Result: every film got rows for every sibling's time. Fixed in
 * `src/scrapers/bfi-pdf/programme-changes-parser.ts`.
 *
 * This script deletes the resulting bogus rows: any (cinema_id='bfi-southbank',
 * datetime) bucket with ≥3 distinct films whose source_ids all start with
 * `bfi-changes-`. Legitimate concurrent screenings at BFI Southbank can have
 * 2 films at the same time (NFT1+NFT2); 3+ is the parser bug.
 *
 * Future scrapes (with the fixed parser) will re-populate the correct rows.
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx scripts/cleanup-bfi-cluster-bug.ts
 *   add --apply to commit deletions
 */
import { db } from "@/db";
import { screenings } from "@/db/schema";
import { inArray, sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`BFI Southbank cluster cleanup — ${APPLY ? "APPLY" : "DRY RUN"} mode`);

  // Find every (datetime) cluster with ≥3 distinct bfi-changes films.
  const clusters = await db.execute(sql`
    WITH suspicious AS (
      SELECT s.datetime, COUNT(DISTINCT s.film_id) AS distinct_films
      FROM screenings s
      WHERE s.cinema_id = 'bfi-southbank'
        AND s.source_id LIKE 'bfi-changes-%'
      GROUP BY s.datetime
      HAVING COUNT(DISTINCT s.film_id) >= 3
    )
    SELECT s.id, s.datetime::text AS datetime, s.source_id, f.title AS film_title
    FROM screenings s
    JOIN suspicious sus ON sus.datetime = s.datetime
    JOIN films f ON f.id = s.film_id
    WHERE s.cinema_id = 'bfi-southbank' AND s.source_id LIKE 'bfi-changes-%'
    ORDER BY s.datetime, s.source_id
  `);

  const rows = clusters as unknown as Array<{
    id: string;
    datetime: string;
    source_id: string;
    film_title: string;
  }>;

  // Group for reporting
  const byDatetime = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byDatetime.get(r.datetime) ?? [];
    list.push(r);
    byDatetime.set(r.datetime, list);
  }

  console.log(`\nFound ${byDatetime.size} suspicious datetime clusters, ${rows.length} rows total.\n`);
  let i = 0;
  for (const [dt, group] of byDatetime) {
    if (i++ < 5) {
      console.log(`  ${dt} — ${group.length} films:`);
      for (const r of group) {
        console.log(`    ${r.id.slice(0, 8)}  ${r.film_title}`);
      }
    }
  }
  if (byDatetime.size > 5) console.log(`  … and ${byDatetime.size - 5} more clusters.`);

  if (!APPLY) {
    console.log(`\n[DRY RUN] Pass --apply to delete ${rows.length} bogus rows.`);
    process.exit(0);
  }

  if (rows.length === 0) {
    console.log(`\nNothing to delete. ✅`);
    process.exit(0);
  }

  console.log(`\nDeleting ${rows.length} BFI cluster rows…`);
  const ids = rows.map((r) => r.id);
  const batchSize = 200;
  let deleted = 0;
  for (let j = 0; j < ids.length; j += batchSize) {
    const batch = ids.slice(j, j + batchSize);
    const result = await db
      .delete(screenings)
      .where(inArray(screenings.id, batch))
      .returning({ id: screenings.id });
    deleted += result.length;
    console.log(`  batch ${Math.floor(j / batchSize) + 1}: deleted ${result.length} rows`);
  }
  console.log(`✅ Deleted ${deleted} rows. Run BFI /scrape to re-populate with the fixed parser.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
