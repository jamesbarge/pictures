/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Run Peckhamplex Scraper
 *
 * Usage:
 *   npm run scrape:peckhamplex
 */

import { createPeckhamplexScraper, PECKHAMPLEX_VENUE } from "./cinemas/peckhamplex";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

async function main() {
  console.log(`[peckhamplex] Starting Peckhamplex scrape...`);

  const scraper = createPeckhamplexScraper();

  // Ensure cinema exists in database
  await ensureCinemaExists({
    id: PECKHAMPLEX_VENUE.id,
    name: PECKHAMPLEX_VENUE.name,
    shortName: PECKHAMPLEX_VENUE.shortName,
    website: PECKHAMPLEX_VENUE.website,
    address: {
      street: PECKHAMPLEX_VENUE.address,
      area: PECKHAMPLEX_VENUE.area,
      postcode: PECKHAMPLEX_VENUE.postcode,
    },
    features: PECKHAMPLEX_VENUE.features,
  });

  // Scrape
  const screenings = await scraper.scrape();

  // Save
  if (screenings.length > 0) {
    await saveScreenings(PECKHAMPLEX_VENUE.id, screenings);
  }

  console.log(`[peckhamplex] Complete: ${screenings.length} screenings`);
}

main().catch((error) => {
  console.error("[peckhamplex] Fatal error:", error);
  process.exit(1);
});
