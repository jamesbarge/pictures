/**
 * Run Genesis Cinema Scraper (v2 - BaseScraper version)
 *
 * This tests the refactored Genesis scraper that extends BaseScraper
 * instead of implementing CinemaScraper directly.
 *
 * Usage:
 *   npm run scrape:genesis-v2-basescraper
 */

import { runScraper, createMain, type SingleVenueConfig } from "./runner-factory";
import { createGenesisScraper, GENESIS_VENUE } from "./cinemas/genesis-v2";

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
// Using validation since BaseScraper version now handles this properly
const main = createMain(config, {
  useValidation: true,
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
