/**
 * Run Riverside Studios Scraper (v2 - using runner factory)
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createRiversideScraperV2 } from "./cinemas/riverside-v2";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "riverside",
    name: "Riverside Studios",
    shortName: "Riverside",
    website: "https://riversidestudios.co.uk",
    address: {
      street: "101 Queen Caroline Street",
      area: "Hammersmith",
      postcode: "W6 9BN",
    },
    features: ["independent", "arts-centre", "riverside"],
  },
  createScraper: () => createRiversideScraperV2(),
};

const main = createMain(config, { useValidation: true });
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
