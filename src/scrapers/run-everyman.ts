// @ts-nocheck
/**
 * Run Everyman Scraper
 *
 * Usage:
 *   npm run scrape:everyman                    # Scrape all active venues
 *   npm run scrape:everyman -- hampstead       # Scrape specific venue
 *   npm run scrape:everyman -- hampstead chelsea # Scrape multiple venues
 */

import {
  createEverymanScraper,
  getActiveEverymanVenues,
  EVERYMAN_VENUES,
} from "./chains/everyman";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

async function main() {
  const args = process.argv.slice(2);
  const scraper = createEverymanScraper();

  // Determine which venues to scrape
  let venueIds: string[];

  if (args.length > 0) {
    // Scrape specific venues - allow shorthand
    venueIds = args.map((arg) => {
      const lower = arg.toLowerCase().replace(/\s+/g, "-");
      // Find matching venue
      const venue = EVERYMAN_VENUES.find(
        (v) =>
          v.id === arg ||
          v.id === `everyman-${lower}` ||
          v.slug === lower ||
          v.shortName.toLowerCase().includes(lower)
      );
      return venue?.id || arg;
    });
  } else {
    // Scrape all active venues
    venueIds = getActiveEverymanVenues().map((v) => v.id);
  }

  console.log(`[everyman] Scraping ${venueIds.length} venue(s): ${venueIds.join(", ")}`);

  // Ensure all venues exist in database
  for (const venueId of venueIds) {
    const venue = EVERYMAN_VENUES.find((v) => v.id === venueId);
    if (venue) {
      await ensureCinemaExists({
        id: venue.id,
        name: venue.name,
        shortName: venue.shortName,
        chain: "Everyman",
        website: `https://www.everymancinema.com/venues/${venue.slug}`,
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

  console.log(`[everyman] Complete: ${totalScreenings} screenings from ${results.size} venue(s)`);
}

main().catch((error) => {
  console.error("[everyman] Fatal error:", error);
  process.exit(1);
});
