import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  const dupes = await sql`
    WITH curzon_cinemas AS (
      SELECT id, name FROM cinemas WHERE name ILIKE '%curzon%'
    )
    SELECT
      s1.id AS id_a,
      s2.id AS id_b,
      s1.datetime AS datetime_a,
      s2.datetime AS datetime_b,
      s1.booking_url AS url_a,
      s2.booking_url AS url_b,
      c.name AS cinema_name,
      f.title AS film_title
    FROM screenings s1
    JOIN screenings s2 ON s1.cinema_id = s2.cinema_id
                       AND s1.film_id = s2.film_id
                       AND s1.id < s2.id
                       AND s2.datetime = s1.datetime + INTERVAL '1 hour'
    JOIN curzon_cinemas c ON s1.cinema_id = c.id
    JOIN films f ON s1.film_id = f.id
    WHERE s1.datetime > NOW()
    ORDER BY s1.datetime
    LIMIT 30;
  `;

  console.log(`\n=== Curzon BST duplicate-pair probe ===`);
  console.log(`Found ${dupes.length} candidate duplicates (same film, same cinema, exactly 1h apart) in upcoming screenings\n`);
  let sameUrlCount = 0;
  for (const d of dupes) {
    const sameUrl = d.url_a === d.url_b;
    if (sameUrl) sameUrlCount++;
    console.log(`  ${d.cinema_name} | ${d.film_title}`);
    console.log(`    A: ${d.datetime_a.toISOString()} url=...${(d.url_a ?? '').slice(-40)}`);
    console.log(`    B: ${d.datetime_b.toISOString()} url=...${(d.url_b ?? '').slice(-40)} ${sameUrl ? '<<< SAME URL = BST GHOST' : ''}`);
  }
  console.log(`\nSame-URL ghost pairs (definitive BST signature): ${sameUrlCount}/${dupes.length}`);

  const total = await sql`
    SELECT COUNT(*)::int AS n FROM screenings s
    JOIN cinemas c ON s.cinema_id = c.id
    WHERE c.name ILIKE '%curzon%' AND s.datetime > NOW()
  `;
  console.log(`Total upcoming Curzon screenings: ${total[0].n}`);

  // Also check 00:00-09:59 outliers (BST-during-overnight signature)
  const outliers = await sql`
    SELECT COUNT(*)::int AS n FROM screenings s
    JOIN cinemas c ON s.cinema_id = c.id
    WHERE c.name ILIKE '%curzon%' AND s.datetime > NOW()
      AND EXTRACT(HOUR FROM (s.datetime AT TIME ZONE 'Europe/London')) BETWEEN 0 AND 9
  `;
  console.log(`Curzon screenings 00:00–09:59 London time: ${outliers[0].n}`);

  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
