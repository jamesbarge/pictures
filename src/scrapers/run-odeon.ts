/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Run ODEON Scraper
 *
 * Usage:
 *   npm run scrape:odeon                    # Scrape all active venues
 *   npm run scrape:odeon -- leicester-square # Scrape specific venue
 *   npm run scrape:odeon -- camden islington # Scrape multiple venues
 */

import { createOdeonScraper, getActiveOdeonVenues, ODEON_VENUES } from "./chains/odeon";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

async function main() {
  const args = process.argv.slice(2);
  const scraper = createOdeonScraper();

  // Determine which venues to scrape
  let venueIds: string[];

  if (args.length > 0) {
    // Scrape specific venues
    venueIds = args.map((arg) => {
      // Allow shorthand like "camden" -> "odeon-camden"
      if (!arg.startsWith("odeon-")) {
        return `odeon-${arg}`;
      }
      return arg;
    });
  } else {
    // Scrape all active venues
    venueIds = getActiveOdeonVenues().map((v) => v.id);
  }

  console.log(`[odeon] Scraping ${venueIds.length} venue(s): ${venueIds.join(", ")}`);

  // Ensure all venues exist in database
  for (const venueId of venueIds) {
    const venue = ODEON_VENUES.find((v) => v.id === venueId);
    if (venue) {
      await ensureCinemaExists({
        id: venue.id,
        name: venue.name,
        shortName: venue.shortName,
        chain: "ODEON",
        website: `https://www.odeon.co.uk/cinemas/${venue.slug}/`,
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

  console.log(`[odeon] Complete: ${totalScreenings} screenings from ${results.size} venue(s)`);
}

main().catch((error) => {
  console.error("[odeon] Fatal error:", error);
  process.exit(1);
});
