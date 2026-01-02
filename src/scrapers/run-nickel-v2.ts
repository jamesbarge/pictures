/**
 * Run The Nickel Scraper (v2 - using runner factory)
 *
 * Usage:
 *   npm run scrape:nickel-v2
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createNickelScraperV2 } from "./cinemas/nickel-v2";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "nickel",
    name: "The Nickel",
    shortName: "Nickel",
    website: "https://thenickel.co.uk",
    address: {
      street: "194 Upper Street",
      area: "Islington",
      postcode: "N1 1RQ",
    },
    features: ["independent", "bar", "restaurant"],
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
