/**
 * Fix BFI Booking URLs Migration
 *
 * One-time script to fix broken BFI booking URLs in the database.
 *
 * The BFI changed their search API — the old `article_search_text` parameter
 * now returns an error. This script finds all affected screenings and rebuilds
 * their booking URLs using the new format with `article_search_id` GUIDs.
 *
 * Usage:
 *   npx tsx scripts/fix-bfi-booking-urls.ts          # dry run
 *   npx tsx scripts/fix-bfi-booking-urls.ts --apply   # apply changes
 */

import { db } from "../src/db";
import { screenings } from "../src/db/schema";
import { sql, eq } from "drizzle-orm";
import { buildBFISearchUrl } from "../src/scrapers/bfi-pdf/url-builder";

const DRY_RUN = !process.argv.includes("--apply");

interface BrokenScreening {
  id: string;
  bookingUrl: string;
  cinemaId: string;
}

async function main() {
  console.log(`[fix-bfi-urls] ${DRY_RUN ? "DRY RUN" : "APPLYING CHANGES"}\n`);

  // Find all screenings with the old broken URL format
  const broken = await db
    .select({
      id: screenings.id,
      bookingUrl: screenings.bookingUrl,
      cinemaId: screenings.cinemaId,
    })
    .from(screenings)
    .where(sql`${screenings.bookingUrl} LIKE '%article_search_text%'`);

  console.log(`Found ${broken.length} screenings with broken BFI booking URLs\n`);

  if (broken.length === 0) {
    console.log("Nothing to fix.");
    process.exit(0);
  }

  // Group by cinema for logging
  const byCinema: Record<string, number> = {};
  for (const s of broken) {
    byCinema[s.cinemaId] = (byCinema[s.cinemaId] || 0) + 1;
  }
  console.log("Breakdown by cinema:");
  for (const [cinemaId, count] of Object.entries(byCinema)) {
    console.log(`  ${cinemaId}: ${count}`);
  }
  console.log();

  // Rebuild URLs
  let updated = 0;
  let errors = 0;

  for (const screening of broken) {
    try {
      // Extract the film title from the old URL
      const title = extractTitleFromOldUrl(screening.bookingUrl);
      if (!title) {
        console.warn(`  [SKIP] Could not extract title from: ${screening.bookingUrl}`);
        errors++;
        continue;
      }

      const newUrl = buildBFISearchUrl(title, screening.cinemaId);

      if (!DRY_RUN) {
        await db
          .update(screenings)
          .set({ bookingUrl: newUrl })
          .where(eq(screenings.id, screening.id));
      }

      updated++;

      // Log first few for verification
      if (updated <= 5) {
        console.log(`  [${DRY_RUN ? "WOULD UPDATE" : "UPDATED"}] "${title}" (${screening.cinemaId})`);
        console.log(`    Old: ${screening.bookingUrl.slice(0, 80)}...`);
        console.log(`    New: ${newUrl.slice(0, 80)}...`);
      }
    } catch (err) {
      console.error(`  [ERROR] Screening ${screening.id}:`, err);
      errors++;
    }
  }

  console.log(`\nResults:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Errors:  ${errors}`);
  console.log(`  Total:   ${broken.length}`);

  if (DRY_RUN && updated > 0) {
    console.log(`\nRe-run with --apply to commit changes.`);
  }

  process.exit(0);
}

/**
 * Extract the film title from an old-format BFI booking URL.
 *
 * Old format: ...article_search_text=Some%20Film%20Title
 */
function extractTitleFromOldUrl(url: string): string | null {
  const match = url.match(/article_search_text=(.+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
