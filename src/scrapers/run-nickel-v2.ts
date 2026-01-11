/**
 * Run The Nickel Scraper (v2 - using runner factory)
 *
 * Usage:
 *   npm run scrape:nickel-v2
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createNickelScraperV2, NICKEL_VENUE } from "./cinemas/nickel-v2";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
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
  },
  createScraper: () => createNickelScraperV2(),
};

const main = createMain(config, {
  useValidation: true,
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
