import { db } from "@/db";
import { screenings, cinemas } from "@/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  // Pattern: same (cinemaId, sourceId) appears multiple times with datetimes
  // separated by EXACTLY 1 hour. That's the BST-ghost fingerprint.
  for (const chain of ["everyman", "picturehouse", "curzon"]) {
    const rows = await db.execute(sql`
      SELECT
        s.cinema_id,
        s.source_id,
        COUNT(*)::int AS n,
        MIN(s.datetime) AS earliest,
        MAX(s.datetime) AS latest,
        EXTRACT(EPOCH FROM (MAX(s.datetime) - MIN(s.datetime)))::int AS spread_seconds
      FROM screenings s
      INNER JOIN cinemas c ON c.id = s.cinema_id
      WHERE LOWER(c.name) LIKE ${"%" + chain + "%"}
        AND s.datetime >= NOW()
        AND s.source_id IS NOT NULL
      GROUP BY s.cinema_id, s.source_id
      HAVING COUNT(*) > 1
    `);
    const dupes = rows as unknown as Array<{ cinema_id: string; source_id: string; n: number; earliest: Date; latest: Date; spread_seconds: number }>;
    const oneHourDupes = dupes.filter((d) => Math.abs(d.spread_seconds - 3600) < 60);
    const otherDupes = dupes.filter((d) => Math.abs(d.spread_seconds - 3600) >= 60);
    const totalRowsInvolved = dupes.reduce((s, d) => s + d.n, 0);
    const oneHourRowsInvolved = oneHourDupes.reduce((s, d) => s + d.n, 0);
    console.log(`\n=== ${chain.toUpperCase()} ===`);
    console.log(`  Total (cinema,sourceId) duplicate groups: ${dupes.length}`);
    console.log(`  → with EXACT 1h spread (BST signature):   ${oneHourDupes.length}  (${oneHourRowsInvolved} rows involved)`);
    console.log(`  → other spread (not BST):                 ${otherDupes.length}`);
    if (otherDupes.length > 0 && otherDupes.length < 5) {
      for (const d of otherDupes.slice(0, 3)) {
        console.log(`     ${d.cinema_id} src=${d.source_id.slice(0, 40)} spread=${d.spread_seconds}s n=${d.n}`);
      }
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
