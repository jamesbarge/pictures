/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Run Picturehouse Scraper
 *
 * Usage:
 *   npm run scrape:picturehouse                    # Scrape all active venues
 *   npm run scrape:picturehouse -- central         # Scrape specific venue
 *   npm run scrape:picturehouse -- central hackney # Scrape multiple venues
 */

import {
  createPicturehouseScraper,
  getActivePicturehouseVenues,
  PICTUREHOUSE_VENUES,
} from "./chains/picturehouse";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

async function main() {
  const args = process.argv.slice(2);
  const scraper = createPicturehouseScraper();

  // Determine which venues to scrape
  let venueIds: string[];

  if (args.length > 0) {
    // Scrape specific venues - allow shorthand
    venueIds = args.map((arg) => {
      const lower = arg.toLowerCase();
      // Find matching venue
      const venue = PICTUREHOUSE_VENUES.find(
        (v) =>
          v.id === arg ||
          v.id === `picturehouse-${lower}` ||
          v.slug === lower ||
          v.shortName.toLowerCase().includes(lower)
      );
      return venue?.id || arg;
    });
  } else {
    // Scrape all active venues
    venueIds = getActivePicturehouseVenues().map((v) => v.id);
  }

  console.log(`[picturehouse] Scraping ${venueIds.length} venue(s): ${venueIds.join(", ")}`);

  // Ensure all venues exist in database
  for (const venueId of venueIds) {
    const venue = PICTUREHOUSE_VENUES.find((v) => v.id === venueId);
    if (venue) {
      await ensureCinemaExists({
        id: venue.id,
        name: venue.name,
        shortName: venue.shortName,
        chain: "Picturehouse",
        website: `https://www.picturehouses.com/cinema/${venue.slug}`,
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

  console.log(`[picturehouse] Complete: ${totalScreenings} screenings from ${results.size} venue(s)`);
}

main().catch((error) => {
  console.error("[picturehouse] Fatal error:", error);
  process.exit(1);
});
