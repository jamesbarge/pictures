#!/usr/bin/env tsx
/**
 * Deduplicate screenings that share (cinema_id, source_id) — collapsing across
 * BOTH datetime variants (BST off-by-one rescrapes) AND film_id variants
 * (same source resolved to different films across runs).
 *
 * Why a second cleanup script when `dedupe-screening-source-id-duplicates.ts`
 * already exists:
 *   - That script keys on (cinema_id, source_id, datetime) → catches same-time
 *     dupes (e.g. Hard Boiled @ Nickel) but does NOT catch BST-shift dupes
 *     where the same source_id has rows at datetime + datetime+1h (e.g. Wake
 *     in Fright @ The Gate: 14:30+00 and 15:30+00 with source_id
 *     `picturehouse-gate-notting-hill-18642`).
 *   - This script collapses on (cinema_id, source_id) only — last-scrape wins.
 *
 * Winner selection:
 *   - Same-datetime groups (class 1: film_id mismatch): latest `scraped_at`
 *     wins. Newer scrape usually has the better film resolution.
 *   - Different-datetime groups (class 2: BST off-by-one): the EARLIER
 *     `datetime` wins. The regression always adds +1h to the UTC value, so
 *     the earlier of any near-60min-apart pair is the BST-correct row. This
 *     was verified by spot-checking Wake in Fright @ The Gate and Shrek @
 *     Everyman Maida Vale against the cinemas' upstream listings.
 *
 * Loser rows are deleted (and their festival_screenings rows first).
 *
 * Scope: ALL rows. We bound to no datetime filter because the companion
 * migration adds a unique index across the full table; leaving past-dated
 * dupes in would block the index creation. Past dupes are harmless for the
 * user experience but the constraint still has to be satisfiable.
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx scripts/cleanup-cinema-source-dupes.ts
 *   npx dotenv -e .env.local -- npx tsx scripts/cleanup-cinema-source-dupes.ts --apply
 *   add --verbose to print every group's decision
 */
import { db } from "@/db";
import { screenings } from "@/db/schema";
import { inArray, sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");

interface DupRow {
  id: string;
  cinema_id: string;
  source_id: string;
  datetime: string;
  film_id: string;
  film_title: string | null;
  scraped_at: string;
}

async function main(): Promise<void> {
  console.log(
    `Screenings (cinema_id, source_id) dedup — ${APPLY ? "APPLY" : "DRY RUN"} mode`
  );

  // Pull every row that's part of a (cinema_id, source_id) group with >1
  // upcoming row, in a single query. `INNER JOIN` on a CTE of dup keys.
  const raw = await db.execute(sql`
    WITH dup_keys AS (
      SELECT cinema_id, source_id
      FROM screenings
      WHERE source_id IS NOT NULL
      GROUP BY cinema_id, source_id
      HAVING COUNT(*) > 1
    )
    SELECT
      s.id, s.cinema_id, s.source_id, s.datetime::text AS datetime,
      s.film_id, f.title AS film_title, s.scraped_at::text AS scraped_at
    FROM screenings s
    JOIN dup_keys d ON d.cinema_id = s.cinema_id AND d.source_id = s.source_id
    LEFT JOIN films f ON f.id = s.film_id
    ORDER BY s.cinema_id, s.source_id, s.scraped_at DESC
  `);

  const rows = raw as unknown as DupRow[];

  // Group by (cinema_id, source_id).
  const groups = new Map<string, DupRow[]>();
  for (const r of rows) {
    const key = `${r.cinema_id}|${r.source_id}`;
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    g.push(r);
  }

  console.log(
    `\nFound ${groups.size} (cinema_id, source_id) groups covering ${rows.length} rows.\n`
  );

  // Break down by shape: same-datetime vs different-datetime.
  let sameDatetimeGroups = 0;
  let diffDatetimeGroups = 0;
  const idsToDelete: string[] = [];

  for (const [, g] of groups) {
    const datetimes = new Set(g.map((r) => r.datetime));
    if (datetimes.size === 1) sameDatetimeGroups++;
    else diffDatetimeGroups++;

    // Winner selection — branches on whether all rows share a datetime.
    //   class 1 (same datetime, dup film_id): latest scraped_at wins
    //   class 2 (different datetime ~60min apart): earliest datetime wins
    //                                              (the BST regression always
    //                                              adds +1h to the UTC value)
    //
    // SAFETY: only apply the BST heuristic when the spread is exactly within
    // [55, 65] minutes. Otherwise the gap is too large to be a BST shift —
    // could be a legitimate schedule change at the cinema OR a non-BST clock
    // bug. Fall back to "latest scraped_at wins" in that case rather than
    // silently picking an arbitrary "earlier" row.
    const epochs = g.map((r) => new Date(r.datetime).getTime());
    const spreadMs = Math.max(...epochs) - Math.min(...epochs);
    const spreadMin = spreadMs / 60_000;
    const isBstShift = datetimes.size > 1 && spreadMin >= 55 && spreadMin <= 65;
    g.sort((a, b) => {
      if (isBstShift && a.datetime !== b.datetime) {
        return a.datetime.localeCompare(b.datetime); // earlier first
      }
      if (b.scraped_at !== a.scraped_at) return b.scraped_at.localeCompare(a.scraped_at);
      return b.id.localeCompare(a.id);
    });
    const winner = g[0];
    const losers = g.slice(1);
    for (const l of losers) idsToDelete.push(l.id);

    if (VERBOSE) {
      console.log(
        `${g[0].cinema_id} | ${g[0].source_id.slice(0, 70)}${g[0].source_id.length > 70 ? "…" : ""}`
      );
      console.log(
        `  WINNER  ${winner.id.slice(0, 8)} datetime=${winner.datetime.slice(0, 19)} scraped=${winner.scraped_at.slice(0, 19)} film="${winner.film_title}"`
      );
      for (const l of losers) {
        console.log(
          `   loser  ${l.id.slice(0, 8)} datetime=${l.datetime.slice(0, 19)} scraped=${l.scraped_at.slice(0, 19)} film="${l.film_title}"`
        );
      }
    }
  }

  console.log(`Same-datetime dup groups (true dupes):       ${sameDatetimeGroups}`);
  console.log(`Different-datetime dup groups (BST shifts):  ${diffDatetimeGroups}`);
  console.log(`Rows to delete:                              ${idsToDelete.length}\n`);

  if (!APPLY) {
    console.log(`[DRY RUN] Re-run with --apply to commit deletions.`);
    process.exit(0);
  }

  if (idsToDelete.length === 0) {
    console.log(`Nothing to delete. ✅`);
    process.exit(0);
  }

  // festival_screenings has ON DELETE CASCADE on screening_id, so the join
  // rows go automatically. Delete screenings in batches.
  const batchSize = 200;
  let deleted = 0;
  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const batch = idsToDelete.slice(i, i + batchSize);
    const result = await db
      .delete(screenings)
      .where(inArray(screenings.id, batch))
      .returning({ id: screenings.id });
    deleted += result.length;
    console.log(
      `  batch ${Math.floor(i / batchSize) + 1}: deleted ${result.length} screenings`
    );
  }
  console.log(`✅ Deleted ${deleted} screening rows.`);

  // Post-apply verification: any remaining (cinema_id, source_id) dups?
  const remaining = await db.execute(sql`
    SELECT COUNT(*)::int AS dup_groups
    FROM (
      SELECT 1 FROM screenings
      WHERE source_id IS NOT NULL
      GROUP BY cinema_id, source_id
      HAVING COUNT(*) > 1
    ) t
  `);
  console.log(`\nPost-apply remaining (cinema_id, source_id) dup groups:`, remaining);
  const remainingRows = remaining as unknown as Array<{ dup_groups: number }>;
  const remainingCount = remainingRows[0]?.dup_groups ?? 0;
  if (remainingCount > 0) {
    console.error(
      `❌ ${remainingCount} groups still duplicated. Unique-index migration will FAIL.`
    );
    process.exit(1);
  }
  console.log(`✅ No remaining duplicates. Safe to add the unique index.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("ERR:", e);
  process.exit(1);
});
