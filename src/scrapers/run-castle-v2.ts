/**
 * Run Castle Cinema Scraper (v2 - using runner factory)
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createCastleScraper } from "./cinemas/castle";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "castle",
    name: "Castle Cinema",
    shortName: "Castle",
    website: "https://thecastlecinema.com",
    address: {
      street: "64-66 Brooksby's Walk",
      area: "Hackney",
      postcode: "E9 6DA",
    },
    features: ["independent", "community", "cafe-bar"],
  },
  createScraper: () => createCastleScraper(),
};

const main = createMain(config, { useValidation: true });
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
