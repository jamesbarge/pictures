/**
 * Clean contaminated curzon.com booking URLs from non-Curzon cinemas.
 *
 * These are data quality issues where the Curzon scraper's booking URLs
 * got stored against the wrong cinema's screenings.
 *
 * Run: npx dotenv -e .env.local -- npx tsx scripts/fix-contaminated-booking-urls-v2.ts
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

const CURZON_SLUGS = [
  "curzon-soho",
  "curzon-mayfair",
  "curzon-bloomsbury",
  "curzon-aldgate",
  "curzon-victoria",
  "curzon-hoxton",
  "curzon-kingston",
  "curzon-camden",
  "curzon-wimbledon",
  "curzon-richmond",
];

async function main() {
  const DRY_RUN = process.argv.includes("--dry-run");
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Cleaning contaminated booking URLs...\n`);

  // Cinema ID = slug in this schema. Find curzon.com booking URLs at non-Curzon cinemas.
  const rows = await db.execute(sql`
    SELECT s.id, s.booking_url, s.cinema_id, c.name as cinema_name,
           f.title as film_title
    FROM screenings s
    JOIN cinemas c ON c.id = s.cinema_id
    JOIN films f ON f.id = s.film_id
    WHERE s.booking_url LIKE '%curzon.com%'
    AND s.cinema_id NOT LIKE 'curzon-%'
    AND s.datetime >= NOW()
    ORDER BY c.name, f.title
  `);

  const results = rows as unknown as Array<{
    id: string;
    booking_url: string;
    cinema_id: string;
    cinema_name: string;
    film_title: string;
  }>;

  console.log(`Found ${results.length} contaminated screenings:\n`);

  let currentCinema = "";
  for (const r of results) {
    if (r.cinema_name !== currentCinema) {
      currentCinema = r.cinema_name;
      console.log(`\n${currentCinema} (${r.cinema_id}):`);
    }
    console.log(`  "${r.film_title}" → ${r.booking_url.substring(0, 60)}...`);
  }

  if (results.length === 0) {
    console.log("No contaminated URLs found.");
    process.exit(0);
  }

  if (!DRY_RUN) {
    console.log(`\nNulling ${results.length} contaminated booking URLs...`);

    await db.execute(sql`
      UPDATE screenings
      SET booking_url = NULL, updated_at = NOW()
      WHERE booking_url LIKE '%curzon.com%'
      AND cinema_id NOT LIKE 'curzon-%'
      AND datetime >= NOW()
    `);

    console.log(`✓ Cleaned ${results.length} contaminated booking URLs.`);
  } else {
    console.log(`\n[DRY RUN] Would null ${results.length} booking URLs.`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
