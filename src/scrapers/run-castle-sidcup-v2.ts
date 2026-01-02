/**
 * Run Castle Sidcup Scraper (v2 - using runner factory)
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createCastleSidcupScraper } from "./cinemas/castle-sidcup";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "castle-sidcup",
    name: "Castle Sidcup",
    shortName: "Castle Sidcup",
    website: "https://castlesidcup.com",
    address: {
      street: "88 Main Road",
      area: "Sidcup",
      postcode: "DA14 6NG",
    },
    features: ["independent", "community"],
  },
  createScraper: () => createCastleSidcupScraper(),
};

const main = createMain(config, { useValidation: true });
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
