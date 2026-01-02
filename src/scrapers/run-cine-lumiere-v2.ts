/**
 * Run Ciné Lumière Scraper (v2 - using runner factory)
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createCineLumiereScraper } from "./cinemas/cine-lumiere";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "cine-lumiere",
    name: "Ciné Lumière",
    shortName: "Ciné Lumière",
    website: "https://www.institut-francais.org.uk",
    address: {
      street: "17 Queensberry Place",
      area: "South Kensington",
      postcode: "SW7 2DT",
    },
    features: ["independent", "french", "art-house", "cultural-institute"],
  },
  createScraper: () => createCineLumiereScraper(),
};

const main = createMain(config, { useValidation: true });
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
