/**
 * Run Prince Charles Cinema Scraper (v2 - using runner factory)
 *
 * Usage:
 *   npm run scrape:pcc-v2
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createPrinceCharlesScraper } from "./cinemas/prince-charles";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "prince-charles",
    name: "Prince Charles Cinema",
    shortName: "PCC",
    website: "https://princecharlescinema.com",
    address: {
      street: "7 Leicester Place",
      area: "Leicester Square",
      postcode: "WC2H 7BY",
    },
    features: ["independent", "repertory", "sing-along", "marathons", "35mm", "70mm"],
  },
  createScraper: () => createPrinceCharlesScraper(),
};

const main = createMain(config, {
  useValidation: true,
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
