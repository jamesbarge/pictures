// @ts-nocheck
/**
 * Run Curzon Scraper
 *
 * Usage:
 *   npm run scrape:curzon              # Scrape all active venues
 *   npm run scrape:curzon -- soho      # Scrape specific venue
 *   npm run scrape:curzon -- soho mayfair  # Scrape multiple venues
 */

import { createCurzonScraper, getActiveCurzonVenues, CURZON_VENUES } from "./chains/curzon";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

async function main() {
  const args = process.argv.slice(2);
  const scraper = createCurzonScraper();

  // Determine which venues to scrape
  let venueIds: string[];

  if (args.length > 0) {
    // Scrape specific venues
    venueIds = args.map((arg) => {
      // Allow shorthand like "soho" -> "curzon-soho"
      if (!arg.startsWith("curzon-")) {
        return `curzon-${arg}`;
      }
      return arg;
    });
  } else {
    // Scrape all active venues
    venueIds = getActiveCurzonVenues().map((v) => v.id);
  }

  console.log(`[curzon] Scraping ${venueIds.length} venue(s): ${venueIds.join(", ")}`);

  // Ensure all venues exist in database
  for (const venueId of venueIds) {
    const venue = CURZON_VENUES.find((v) => v.id === venueId);
    if (venue) {
      await ensureCinemaExists({
        id: venue.id,
        name: venue.name,
        shortName: venue.shortName,
        chain: "Curzon",
        website: `https://www.curzon.com/venues/${venue.slug}/`,
        address: {
          street: venue.address,
          area: venue.area,
          postcode: venue.postcode,
        },
        features: venue.features || [],
      });
    }
  }

  // Scrape venues
  const results = await scraper.scrapeVenues(venueIds);

  // Save screenings
  let totalScreenings = 0;
  for (const [venueId, screenings] of results) {
    if (screenings.length > 0) {
      await saveScreenings(venueId, screenings);
      totalScreenings += screenings.length;
    }
  }

  console.log(`[curzon] Complete: ${totalScreenings} screenings from ${results.size} venue(s)`);
}

main().catch((error) => {
  console.error("[curzon] Fatal error:", error);
  process.exit(1);
});
