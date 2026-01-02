/**
 * Run Lexi Cinema Scraper (v2 - using runner factory)
 *
 * Usage:
 *   npm run scrape:lexi-v2
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createLexiScraper } from "./cinemas/lexi";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "lexi",
    name: "The Lexi Cinema",
    shortName: "Lexi",
    website: "https://thelexicinema.co.uk",
    address: {
      street: "194B Chamberlayne Road",
      area: "Kensal Rise",
      postcode: "NW10 3JU",
    },
    features: ["independent", "community", "charity", "art-deco"],
  },
  createScraper: () => createLexiScraper(),
};

const main = createMain(config, {
  useValidation: true,
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
