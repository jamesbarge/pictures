/**
 * Run Olympic Cinema Scraper (v2 - using runner factory)
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createOlympicScraper } from "./cinemas/olympic";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "olympic",
    name: "Olympic Cinema",
    shortName: "Olympic",
    website: "https://www.olympiccinema.com",
    address: {
      street: "117-123 Church Road",
      area: "Barnes",
      postcode: "SW13 9HL",
    },
    features: ["independent", "historic", "studio-heritage"],
  },
  createScraper: () => createOlympicScraper(),
};

const main = createMain(config, { useValidation: true });
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
