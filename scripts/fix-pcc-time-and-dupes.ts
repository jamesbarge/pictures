/**
 * Fix PCC Timezone Offset + Merge "Slayer Part Two" Duplicate
 *
 * 1. Merges the orphan "Slayer Part Two" film into "Dune: Part Two"
 *    (migrates screenings, deletes the orphan).
 * 2. Fixes BST-affected PCC screening times by subtracting 1 hour
 *    from screenings stored with incorrect UTC offset.
 *
 * Run: npx dotenv -e .env.local -- npx tsx scripts/fix-pcc-time-and-dupes.ts
 * Dry run: npx dotenv -e .env.local -- npx tsx scripts/fix-pcc-time-and-dupes.ts --dry-run
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  // ── Step 1: Merge "Slayer Part Two" into "Dune: Part Two" ──────────

  console.log("=== Step 1: Merge duplicate film ===");

  const slayerRows = await db.execute(sql`
    SELECT id, title FROM films WHERE title ILIKE '%slayer%part%two%'
  `);
  const duneRows = await db.execute(sql`
    SELECT id, title FROM films WHERE title ILIKE '%dune%part%two%'
  `);

  const slayerFilms = slayerRows as unknown as Array<{ id: string; title: string }>;
  const duneFilms = duneRows as unknown as Array<{ id: string; title: string }>;

  if (slayerFilms.length === 0) {
    console.log("No 'Slayer Part Two' film found — already cleaned up or doesn't exist.");
  } else if (duneFilms.length === 0) {
    console.log("WARNING: No 'Dune: Part Two' film found — cannot merge. Create it first.");
  } else {
    const slayer = slayerFilms[0];
    const dune = duneFilms[0];

    console.log(`Found orphan: "${slayer.title}" (${slayer.id})`);
    console.log(`Merge target: "${dune.title}" (${dune.id})`);

    // Count screenings to migrate
    const countRows = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM screenings WHERE film_id = ${slayer.id}
    `);
    const count = (countRows as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0;
    console.log(`Screenings to migrate: ${count}`);

    if (!DRY_RUN) {
      // Delete orphan screenings (they duplicate existing Dune screenings)
      await db.execute(sql`
        DELETE FROM screenings WHERE film_id = ${slayer.id}
      `);
      console.log(`Deleted ${count} orphan screenings.`);

      // Delete orphan film
      await db.execute(sql`DELETE FROM films WHERE id = ${slayer.id}`);
      console.log(`Deleted orphan film "${slayer.title}".`);
    } else {
      console.log(`[DRY RUN] Would delete ${count} orphan screenings and film "${slayer.title}".`);
    }
  }

  // ── Step 2: Fix BST-affected screening times ──────────────────────

  console.log("\n=== Step 2: Fix BST-affected screening times ===");

  // Find PCC screenings in BST range (April-October) that were stored
  // without the BST offset correction. These show 1 hour ahead.
  // We subtract 1 hour from their datetime.
  const bstScreenings = await db.execute(sql`
    SELECT s.id, s.datetime, f.title
    FROM screenings s
    JOIN films f ON f.id = s.film_id
    JOIN cinemas c ON c.id = s.cinema_id
    WHERE c.id = 'prince-charles'
      AND s.datetime >= '2026-03-29T01:00:00Z'
      AND EXTRACT(MONTH FROM s.datetime) BETWEEN 3 AND 10
      AND s.datetime >= NOW()
    ORDER BY s.datetime
  `);

  const screeningsToFix = bstScreenings as unknown as Array<{
    id: string;
    datetime: Date;
    title: string;
  }>;

  console.log(`Found ${screeningsToFix.length} PCC screenings in BST date range.`);

  if (screeningsToFix.length > 0) {
    console.log("\nSample (first 10):");
    for (const s of screeningsToFix.slice(0, 10)) {
      const dt = new Date(s.datetime);
      const corrected = new Date(dt.getTime() - 60 * 60 * 1000);
      console.log(
        `  ${s.title}: ${dt.toISOString()} → ${corrected.toISOString()}`
      );
    }

    if (!DRY_RUN) {
      // First delete screenings that would collide after the time shift
      // (these are duplicates where the correct time already exists)
      await db.execute(sql`
        DELETE FROM screenings
        WHERE id IN (
          SELECT s.id
          FROM screenings s
          JOIN cinemas c ON c.id = s.cinema_id
          WHERE c.id = 'prince-charles'
            AND s.datetime >= '2026-03-29T01:00:00Z'
            AND EXTRACT(MONTH FROM s.datetime) BETWEEN 3 AND 10
            AND s.datetime >= NOW()
            AND EXISTS (
              SELECT 1 FROM screenings s2
              WHERE s2.film_id = s.film_id
                AND s2.cinema_id = s.cinema_id
                AND s2.datetime = s.datetime - interval '1 hour'
                AND s2.id != s.id
            )
        )
      `);
      console.log(`\nDeleted colliding duplicates.`);

      // Now shift remaining screenings
      await db.execute(sql`
        UPDATE screenings
        SET datetime = datetime - interval '1 hour'
        WHERE id IN (
          SELECT s.id
          FROM screenings s
          JOIN cinemas c ON c.id = s.cinema_id
          WHERE c.id = 'prince-charles'
            AND s.datetime >= '2026-03-29T01:00:00Z'
            AND EXTRACT(MONTH FROM s.datetime) BETWEEN 3 AND 10
            AND s.datetime >= NOW()
        )
      `);
      console.log(`Fixed remaining screening times.`);
    } else {
      console.log(`\n[DRY RUN] Would fix ${screeningsToFix.length} screening times.`);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
