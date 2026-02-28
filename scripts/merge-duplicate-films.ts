/**
 * Merge duplicate film records (same title, different IDs).
 * Keeps the record with best metadata and migrates all screenings to it.
 *
 * Run: npx dotenv -e .env.local -- npx tsx scripts/merge-duplicate-films.ts
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Merging duplicate film records...\n");

  // Find films with duplicate titles that have upcoming screenings
  const rows = await db.execute(sql`
    WITH upcoming_films AS (
      SELECT DISTINCT f.id, f.title, f.tmdb_id, f.poster_url, f.synopsis, f.created_at
      FROM films f
      INNER JOIN screenings s ON s.film_id = f.id AND s.datetime >= NOW()
    ),
    dupes AS (
      SELECT title, COUNT(*) as cnt
      FROM upcoming_films
      GROUP BY title
      HAVING COUNT(*) > 1
    )
    SELECT uf.id, uf.title, uf.tmdb_id, uf.poster_url IS NOT NULL as has_poster,
           uf.synopsis IS NOT NULL as has_synopsis, uf.created_at
    FROM upcoming_films uf
    INNER JOIN dupes d ON d.title = uf.title
    ORDER BY uf.title,
             CASE WHEN uf.tmdb_id IS NOT NULL THEN 0 ELSE 1 END,
             CASE WHEN uf.poster_url IS NOT NULL THEN 0 ELSE 1 END,
             uf.created_at ASC
  `);

  const results = rows as unknown as Array<{
    id: string;
    title: string;
    tmdb_id: number | null;
    has_poster: boolean;
    has_synopsis: boolean;
    created_at: Date;
  }>;

  // Group by title
  const groups = new Map<string, typeof results>();
  for (const r of results) {
    const existing = groups.get(r.title);
    if (existing) {
      existing.push(r);
    } else {
      groups.set(r.title, [r]);
    }
  }

  let totalMerged = 0;
  for (const [title, group] of groups) {
    const primary = group[0];
    const dupes = group.slice(1);

    console.log(`"${title}" — ${group.length} records`);
    console.log(`  Keep: ${primary.id} (tmdb=${primary.tmdb_id || "none"}, poster=${primary.has_poster})`);

    for (const dup of dupes) {
      console.log(`  Merge: ${dup.id} (tmdb=${dup.tmdb_id || "none"}, poster=${dup.has_poster})`);

      // First delete conflicting screenings (same cinema+datetime already exists on primary)
      await db.execute(sql`
        DELETE FROM screenings d
        WHERE d.film_id = ${dup.id}
        AND EXISTS (
          SELECT 1 FROM screenings p
          WHERE p.film_id = ${primary.id}
          AND p.cinema_id = d.cinema_id
          AND p.datetime = d.datetime
        )
      `);

      // Migrate remaining screenings to primary
      await db.execute(sql`
        UPDATE screenings SET film_id = ${primary.id}, updated_at = NOW()
        WHERE film_id = ${dup.id}
      `);

      // Delete orphaned film record
      await db.execute(sql`DELETE FROM films WHERE id = ${dup.id}`);
      totalMerged++;
    }
    console.log();
  }

  console.log(`Merged ${totalMerged} duplicate film records.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
