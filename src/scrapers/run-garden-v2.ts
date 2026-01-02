/**
 * Run Garden Cinema Scraper (v2 - using runner factory)
 *
 * Usage:
 *   npm run scrape:garden-v2
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createGardenCinemaScraper } from "./cinemas/garden";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "garden",
    name: "Garden Cinema",
    shortName: "Garden",
    website: "https://thegardencinema.co.uk",
    address: {
      street: "39-41 Parker Street",
      area: "Covent Garden",
      postcode: "WC2B 5PQ",
    },
    features: ["independent", "art-house", "bar", "luxury"],
  },
  createScraper: () => createGardenCinemaScraper(),
};

const main = createMain(config, {
  useValidation: true,
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
