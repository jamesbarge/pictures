/**
 * Run Rich Mix Scraper (v2 - using runner factory)
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createRichMixScraperV2 } from "./cinemas/rich-mix-v2";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "rich-mix",
    name: "Rich Mix",
    shortName: "Rich Mix",
    website: "https://richmix.org.uk",
    address: {
      street: "35-47 Bethnal Green Road",
      area: "Shoreditch",
      postcode: "E1 6LA",
    },
    features: ["independent", "arts-centre", "community", "world-cinema"],
  },
  createScraper: () => createRichMixScraperV2(),
};

const main = createMain(config, { useValidation: true });
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
