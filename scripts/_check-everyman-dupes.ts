import { db } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import { sql, eq, gte, and, inArray } from "drizzle-orm";

async function main() {
  // Find screenings that share a booking URL within Everyman venues — these
  // are duplicates. Show their datetime offsets and creation times.
  const allEverymanCinemas = await db
    .select({ id: cinemas.id, name: cinemas.name })
    .from(cinemas)
    .where(sql`${cinemas.id} LIKE 'everyman%' OR ${cinemas.id} = 'screen-on-the-green'`);

  const ids = allEverymanCinemas.map((c) => c.id);
  console.log(`Checking ${ids.length} Everyman venues for booking-URL duplicates...\n`);

  const dupes = await db.execute<{
    booking_url: string;
    cinema_id: string;
    n: number;
    times: string;
    ids: string;
    scraped_ats: string;
  }>(sql`
    SELECT
      booking_url,
      cinema_id,
      COUNT(*)::int AS n,
      string_agg(
        to_char(datetime AT TIME ZONE 'Europe/London', 'YYYY-MM-DD HH24:MI'),
        ' | ' ORDER BY datetime
      ) AS times,
      string_agg(id, ' | ' ORDER BY datetime) AS ids,
      string_agg(to_char(scraped_at, 'YYYY-MM-DD HH24:MI:SS'), ' | ' ORDER BY datetime) AS scraped_ats
    FROM screenings
    WHERE cinema_id = ANY(${sql.raw(`ARRAY['${ids.join("','")}']`)})
      AND datetime >= NOW()
      AND booking_url <> ''
    GROUP BY booking_url, cinema_id
    HAVING COUNT(*) > 1
    ORDER BY cinema_id, booking_url
    LIMIT 40;
  `);

  const rows = (dupes as unknown as Array<{ booking_url: string; cinema_id: string; n: number; times: string; ids: string; scraped_ats: string }>);
  console.log(`Found ${rows.length} booking URLs with multiple upcoming screenings:\n`);
  if (rows.length === 0) {
    console.log("(none — duplicates are not the dominant pattern. Maybe individual ID-level dupes from a specific run.)");
  }
  for (const r of rows.slice(0, 20)) {
    console.log(`  ${r.cinema_id.padEnd(22)} n=${r.n}  times=${r.times}`);
    console.log(`    created: ${r.scraped_ats}`);
    console.log(`    url: ${r.booking_url.slice(0, 90)}...`);
  }

  // How many total screenings have +1h duplicates at Everyman?
  const totalDupes = await db.execute<{ total: number }>(sql`
    SELECT COUNT(*)::int AS total
    FROM screenings
    WHERE cinema_id = ANY(${sql.raw(`ARRAY['${ids.join("','")}']`)})
      AND datetime >= NOW()
      AND booking_url IN (
        SELECT booking_url FROM screenings
        WHERE cinema_id = ANY(${sql.raw(`ARRAY['${ids.join("','")}']`)})
          AND datetime >= NOW()
          AND booking_url <> ''
        GROUP BY booking_url HAVING COUNT(*) > 1
      );
  `);
  const td = totalDupes as unknown as Array<{ total: number }>;
  console.log(`\nTotal upcoming screenings at Everyman involved in dupes: ${td[0]?.total ?? 0}`);

  // Counter-control: same query for picturehouse
  const phDupes = await db.execute<{ total: number }>(sql`
    SELECT COUNT(*)::int AS total
    FROM screenings s
    INNER JOIN cinemas c ON c.id = s.cinema_id
    WHERE c.name LIKE '%Picturehouse%'
      AND s.datetime >= NOW()
      AND s.booking_url IN (
        SELECT booking_url FROM screenings s2
        INNER JOIN cinemas c2 ON c2.id = s2.cinema_id
        WHERE c2.name LIKE '%Picturehouse%' AND s2.datetime >= NOW() AND s2.booking_url <> ''
        GROUP BY booking_url HAVING COUNT(*) > 1
      );
  `);
  const phd = phDupes as unknown as Array<{ total: number }>;
  console.log(`Control: Picturehouse dupes (same query): ${phd[0]?.total ?? 0}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
