/**
 * Run Rio Cinema Scraper (v2 - using runner factory)
 *
 * Usage:
 *   npm run scrape:rio-v2
 */

import { runScraper, createMain, type SingleVenueConfig } from "./runner-factory";
import { createRioScraper } from "./cinemas/rio";

// Configure the single venue scraper
const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "rio-dalston",
    name: "Rio Cinema",
    shortName: "Rio",
    website: "https://riocinema.org.uk",
    address: {
      street: "107 Kingsland High Street",
      area: "Dalston",
      postcode: "E8 2PB",
    },
    features: ["independent", "repertory", "bar", "35mm", "art-deco"],
  },
  createScraper: () => createRioScraper(),
};

// Create and run main function
const main = createMain(config, {
  useValidation: true,
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
