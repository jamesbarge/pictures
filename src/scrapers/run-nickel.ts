// @ts-nocheck
/**
 * Run The Nickel Cinema Scraper
 *
 * Usage:
 *   npm run scrape:nickel
 */

import { createNickelScraper, NICKEL_VENUE } from "./cinemas/the-nickel";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

async function main() {
  console.log(`[the-nickel] Starting The Nickel scrape...`);

  const scraper = createNickelScraper();

  // Ensure cinema exists in database
  await ensureCinemaExists({
    id: NICKEL_VENUE.id,
    name: NICKEL_VENUE.name,
    shortName: NICKEL_VENUE.shortName,
    website: NICKEL_VENUE.website,
    address: {
      street: NICKEL_VENUE.address,
      area: NICKEL_VENUE.area,
      postcode: NICKEL_VENUE.postcode,
    },
    features: NICKEL_VENUE.features,
  });

  // Scrape
  const screenings = await scraper.scrape();

  // Save
  if (screenings.length > 0) {
    await saveScreenings(NICKEL_VENUE.id, screenings);
  }

  console.log(`[the-nickel] Complete: ${screenings.length} screenings`);
}

main().catch((error) => {
  console.error("[the-nickel] Fatal error:", error);
  process.exit(1);
});
