#!/usr/bin/env tsx
/**
 * Comprehensive audit of duplicate screenings in production.
 *
 * Background:
 *   The screenings table's unique index is on (filmId, cinemaId, datetime).
 *   That doesn't prevent two scrapes of the same (cinemaId, sourceId, datetime)
 *   resolving to different filmIds and both being inserted — exactly the
 *   Stoma → Guo Ran bug.
 *
 * Outputs:
 *   1. Confirm what unique INDEXES exist on screenings (not just constraints).
 *   2. Total count of (cinemaId, sourceId, datetime) tuples with > 1 row.
 *   3. Same, broken down by cinema.
 *   4. Same, by mismatch shape (1 distinct film vs N distinct films).
 *   5. Top 30 worst offenders with their film titles, scraped_at timestamps,
 *      and source_id↔film_title trigram similarity for each row in the group.
 *   6. Past vs future split (so we know how much is stale-on-the-calendar).
 *
 * Read-only.
 */
import { db } from "@/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("=== 1. Unique indexes on screenings ===");
  const idx = await db.execute(sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'screenings'
  `);
  console.log(idx);

  console.log("\n=== 2. Total (cinema, source_id, datetime) duplicate triples ===");
  const totals = await db.execute(sql`
    WITH dupes AS (
      SELECT cinema_id, source_id, datetime, COUNT(*) AS rows, COUNT(DISTINCT film_id) AS distinct_films
      FROM screenings
      WHERE source_id IS NOT NULL
      GROUP BY cinema_id, source_id, datetime
      HAVING COUNT(*) > 1
    )
    SELECT
      COUNT(*) AS dup_triples,
      SUM(rows) AS total_rows_in_dups,
      SUM(rows - 1) AS excess_rows,
      SUM(CASE WHEN distinct_films > 1 THEN 1 ELSE 0 END) AS triples_with_film_mismatch
    FROM dupes
  `);
  console.log(totals);

  console.log("\n=== 3. By cinema ===");
  const byCinema = await db.execute(sql`
    WITH dupes AS (
      SELECT cinema_id, source_id, datetime, COUNT(*) AS rows, COUNT(DISTINCT film_id) AS distinct_films
      FROM screenings
      WHERE source_id IS NOT NULL
      GROUP BY cinema_id, source_id, datetime
      HAVING COUNT(*) > 1
    )
    SELECT cinema_id,
           COUNT(*) AS dup_triples,
           SUM(rows - 1) AS excess_rows,
           SUM(CASE WHEN distinct_films > 1 THEN 1 ELSE 0 END) AS film_mismatches
    FROM dupes
    GROUP BY cinema_id
    ORDER BY excess_rows DESC
  `);
  console.log(byCinema);

  console.log("\n=== 4. Past vs future split ===");
  const split = await db.execute(sql`
    WITH dupes AS (
      SELECT cinema_id, source_id, datetime, COUNT(*) AS rows, COUNT(DISTINCT film_id) AS distinct_films
      FROM screenings
      WHERE source_id IS NOT NULL
      GROUP BY cinema_id, source_id, datetime
      HAVING COUNT(*) > 1
    )
    SELECT
      CASE WHEN datetime > now() THEN 'future' ELSE 'past' END AS bucket,
      COUNT(*) AS dup_triples,
      SUM(rows - 1) AS excess_rows
    FROM dupes
    GROUP BY bucket
    ORDER BY bucket
  `);
  console.log(split);

  console.log("\n=== 5. Top 30 future duplicates with film titles + similarity ===");
  const detail = await db.execute(sql`
    WITH dup_groups AS (
      SELECT cinema_id, source_id, datetime
      FROM screenings
      WHERE source_id IS NOT NULL AND datetime > now()
      GROUP BY cinema_id, source_id, datetime
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 30
    )
    SELECT s.cinema_id, s.source_id, s.datetime,
           s.id AS screening_id,
           f.title AS film_title, f.year AS film_year,
           similarity(replace(replace(s.source_id, s.cinema_id || '-', ''), '-', ' '), f.title) AS sim,
           s.scraped_at, s.updated_at
    FROM screenings s
    JOIN dup_groups d
      ON d.cinema_id = s.cinema_id AND d.source_id = s.source_id AND d.datetime = s.datetime
    LEFT JOIN films f ON f.id = s.film_id
    ORDER BY s.cinema_id, s.source_id, s.datetime, sim DESC
  `);
  console.log(detail);

  console.log("\n=== 6. NULL source_id rows (excluded from above) ===");
  const nullSrc = await db.execute(sql`
    SELECT COUNT(*) AS rows_with_null_source_id
    FROM screenings
    WHERE source_id IS NULL
  `);
  console.log(nullSrc);
  process.exit(0);
}

main().catch((e) => {
  console.error("ERR:", e);
  process.exit(1);
});
