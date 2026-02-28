/**
 * One-time script to delete contaminated booking URLs.
 * Some non-Curzon cinemas have Curzon booking URLs stored against their screenings.
 * This deletes those bad URLs so scrapers can fill in correct ones on next run.
 *
 * Run: npx dotenv -e .env.local -- npx tsx scripts/fix-contaminated-booking-urls.ts
 * Dry run: npx dotenv -e .env.local -- npx tsx scripts/fix-contaminated-booking-urls.ts --dry-run
 */

import { db } from "@/db";
import { screenings, cinemas, films } from "@/db/schema";
import { eq, and, like, gte, sql, not, inArray } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");

// Curzon cinema IDs (only these should have curzon.com booking URLs)
const CURZON_IDS = [
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
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Cleaning contaminated booking URLs...\n`);

  const now = new Date();

  // Find non-Curzon screenings with Curzon booking URLs
  const contaminated = await db
    .select({
      id: screenings.id,
      bookingUrl: screenings.bookingUrl,
      cinemaId: screenings.cinemaId,
      cinemaName: cinemas.name,
      filmTitle: films.title,
    })
    .from(screenings)
    .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
    .innerJoin(films, eq(screenings.filmId, films.id))
    .where(
      and(
        like(screenings.bookingUrl, "%curzon.com%"),
        not(inArray(screenings.cinemaId, CURZON_IDS)),
        gte(screenings.datetime, now)
      )
    );

  console.log(`Found ${contaminated.length} contaminated booking URLs:\n`);

  // Group by cinema for display
  const byCinema = new Map<string, typeof contaminated>();
  for (const s of contaminated) {
    if (!byCinema.has(s.cinemaName)) byCinema.set(s.cinemaName, []);
    byCinema.get(s.cinemaName)!.push(s);
  }

  for (const [cinema, items] of byCinema) {
    console.log(`  ${cinema}: ${items.length} contaminated URLs`);
    for (const item of items.slice(0, 3)) {
      console.log(`    - "${item.filmTitle}" → ${item.bookingUrl.substring(0, 60)}...`);
    }
    if (items.length > 3) console.log(`    ... and ${items.length - 3} more`);
  }

  if (!DRY_RUN && contaminated.length > 0) {
    // Clear the booking URLs (set to empty string since column may be NOT NULL)
    const ids = contaminated.map((s) => s.id);
    const result = await db
      .update(screenings)
      .set({ bookingUrl: "", updatedAt: new Date() })
      .where(inArray(screenings.id, ids));

    console.log(`\nCleared ${contaminated.length} contaminated booking URLs.`);
  }

  // Also find and report any other domain mismatches
  console.log("\n--- Additional domain mismatch check ---");

  // Check for themoviedb.org URLs (clearly wrong data)
  const tmdbUrls = await db
    .select({
      id: screenings.id,
      bookingUrl: screenings.bookingUrl,
      cinemaName: cinemas.name,
      filmTitle: films.title,
    })
    .from(screenings)
    .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
    .innerJoin(films, eq(screenings.filmId, films.id))
    .where(
      and(
        like(screenings.bookingUrl, "%themoviedb.org%"),
        gte(screenings.datetime, now)
      )
    );

  if (tmdbUrls.length > 0) {
    console.log(`\nFound ${tmdbUrls.length} screenings with TMDB URLs as booking links:`);
    for (const s of tmdbUrls) {
      console.log(`  - "${s.filmTitle}" at ${s.cinemaName}: ${s.bookingUrl}`);
    }
    if (!DRY_RUN) {
      const ids = tmdbUrls.map((s) => s.id);
      await db
        .update(screenings)
        .set({ bookingUrl: "", updatedAt: new Date() })
        .where(inArray(screenings.id, ids));
      console.log(`Cleared ${tmdbUrls.length} TMDB booking URLs.`);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
