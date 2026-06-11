/**
 * Run Riverside Studios Scraper (v2 - using runner factory)
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createRiversideScraperV2 } from "./cinemas/riverside-v2";
import { getVenueFromRegistry } from "./utils/venue-from-registry";

const config: SingleVenueConfig = {
  type: "single",
  venue: getVenueFromRegistry("riverside-studios"),
  createScraper: () => createRiversideScraperV2(),
};

const main = createMain(config, { useValidation: true });
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
