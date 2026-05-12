import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  // Find ghost pairs: same (cinema_id, film_id, booking_url), exactly 1h apart,
  // both in the future. The later one is the BST-corrupted ghost — delete it.
  const ghosts = await sql`
    SELECT
      s2.id AS ghost_id,
      s1.id AS keep_id,
      s1.datetime AS keep_dt,
      s2.datetime AS ghost_dt,
      c.name AS cinema_name,
      f.title AS film_title,
      s1.booking_url
    FROM screenings s1
    JOIN screenings s2 ON s1.cinema_id = s2.cinema_id
                       AND s1.film_id = s2.film_id
                       AND s1.booking_url = s2.booking_url
                       AND s1.id < s2.id
                       AND s2.datetime = s1.datetime + INTERVAL '1 hour'
    JOIN cinemas c ON s1.cinema_id = c.id
    JOIN films f ON s1.film_id = f.id
    WHERE c.name ILIKE '%curzon%'
      AND s1.datetime > NOW()
      AND s1.booking_url IS NOT NULL
    ORDER BY s1.datetime
  `;

  console.log(`\n=== Curzon BST ghost cleanup ===`);
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — found ${ghosts.length} ghost pairs\n`);

  for (const g of ghosts) {
    console.log(`  ${g.cinema_name} | ${g.film_title}`);
    console.log(`    KEEP  ${g.keep_dt.toISOString()} (id=${g.keep_id.slice(0, 8)})`);
    console.log(`    GHOST ${g.ghost_dt.toISOString()} (id=${g.ghost_id.slice(0, 8)}) — to delete`);
  }

  if (APPLY && ghosts.length > 0) {
    const ids = ghosts.map(g => g.ghost_id);
    const result = await sql`DELETE FROM screenings WHERE id = ANY(${ids}) RETURNING id`;
    console.log(`\nDeleted ${result.length} ghost rows.`);
  } else if (!APPLY) {
    console.log(`\n(dry run — re-run with --apply to delete)`);
  }

  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
