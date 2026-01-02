/**
 * Run Regent Street Cinema Scraper (v2 - using runner factory)
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createRegentStreetScraper } from "./cinemas/regent-street";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "regent-street",
    name: "Regent Street Cinema",
    shortName: "Regent Street",
    website: "https://www.regentstreetcinema.com",
    address: {
      street: "309 Regent Street",
      area: "West End",
      postcode: "W1B 2HW",
    },
    features: ["independent", "historic", "university"],
  },
  createScraper: () => createRegentStreetScraper(),
};

const main = createMain(config, { useValidation: true });
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
