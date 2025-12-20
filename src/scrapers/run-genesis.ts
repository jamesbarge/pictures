// @ts-nocheck
/**
 * Run Genesis Cinema Scraper
 *
 * Usage:
 *   npm run scrape:genesis
 */

import { createGenesisScraper, GENESIS_VENUE } from "./cinemas/genesis";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

async function main() {
  console.log(`[genesis] Starting Genesis Cinema scrape...`);

  const scraper = createGenesisScraper();

  // Ensure cinema exists in database
  await ensureCinemaExists({
    id: GENESIS_VENUE.id,
    name: GENESIS_VENUE.name,
    shortName: GENESIS_VENUE.shortName,
    website: GENESIS_VENUE.website,
    address: {
      street: GENESIS_VENUE.address,
      area: GENESIS_VENUE.area,
      postcode: GENESIS_VENUE.postcode,
    },
    features: GENESIS_VENUE.features,
  });

  // Scrape
  const screenings = await scraper.scrape();

  // Save
  if (screenings.length > 0) {
    await saveScreenings(GENESIS_VENUE.id, screenings);
  }

  console.log(`[genesis] Complete: ${screenings.length} screenings`);
}

main().catch((error) => {
  console.error("[genesis] Fatal error:", error);
  process.exit(1);
});
