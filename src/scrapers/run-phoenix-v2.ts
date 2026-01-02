/**
 * Run Phoenix Cinema Scraper (v2 - using runner factory)
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createPhoenixScraper } from "./cinemas/phoenix";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "phoenix",
    name: "Phoenix Cinema",
    shortName: "Phoenix",
    website: "https://phoenixcinema.co.uk",
    address: {
      street: "52 High Road",
      area: "East Finchley",
      postcode: "N2 9PJ",
    },
    features: ["independent", "historic", "repertory", "art-deco"],
  },
  createScraper: () => createPhoenixScraper(),
};

const main = createMain(config, { useValidation: true });
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
