/**
 * Run Genesis Cinema Scraper (v2 - using runner factory)
 *
 * Usage:
 *   npm run scrape:genesis-v2
 */

import { runScraper, createMain, type SingleVenueConfig } from "./runner-factory";
import { createGenesisScraper, GENESIS_VENUE } from "./cinemas/genesis";

// Configure the single venue scraper
const config: SingleVenueConfig = {
  type: "single",
  venue: {
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
  },
  createScraper: () => createGenesisScraper(),
};

// Create and run main function
// Note: Genesis uses saveScreenings (not processScreenings) in the original
// We set useValidation: false to match original behavior
const main = createMain(config, {
  useValidation: false,
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
