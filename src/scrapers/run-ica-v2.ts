/**
 * Run ICA Cinema Scraper (v2 - using runner factory)
 *
 * Usage:
 *   npm run scrape:ica-v2
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createICAScraper } from "./cinemas/ica";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "ica",
    name: "Institute of Contemporary Arts",
    shortName: "ICA",
    website: "https://www.ica.art",
    address: {
      street: "The Mall",
      area: "St James's",
      postcode: "SW1Y 5AH",
    },
    features: ["independent", "repertory", "art-house", "gallery"],
  },
  createScraper: () => createICAScraper(),
};

const main = createMain(config, {
  useValidation: true,
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
