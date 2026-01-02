/**
 * Run Electric Cinema Scraper (v2 - using runner factory)
 *
 * Usage:
 *   npm run scrape:electric-v2
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createElectricScraperV2 } from "./cinemas/electric-v2";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "electric-portobello",
    name: "Electric Cinema Portobello",
    shortName: "Electric",
    website: "https://www.electriccinema.co.uk",
    address: {
      street: "191 Portobello Road",
      area: "Notting Hill",
      postcode: "W11 2ED",
    },
    features: ["independent", "luxury", "historic", "bar"],
  },
  createScraper: () => createElectricScraperV2(),
};

const main = createMain(config, {
  useValidation: true,
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
