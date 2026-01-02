/**
 * Run Peckham Plex Scraper (v2 - using runner factory)
 *
 * Usage:
 *   npm run scrape:peckhamplex-v2
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createPeckhamplexScraper } from "./cinemas/peckhamplex";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "peckhamplex",
    name: "Peckhamplex",
    shortName: "Plex",
    website: "https://peckhamplex.london",
    address: {
      street: "95A Rye Lane",
      area: "Peckham",
      postcode: "SE15 4ST",
    },
    features: ["independent", "affordable", "community"],
  },
  createScraper: () => createPeckhamplexScraper(),
};

const main = createMain(config, {
  useValidation: true,
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
