/**
 * Run David Lean Cinema Scraper (v2 - using runner factory)
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createDavidLeanScraper } from "./cinemas/david-lean";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "david-lean",
    name: "David Lean Cinema",
    shortName: "David Lean",
    website: "https://www.davidleancinema.org.uk",
    address: {
      street: "The Clocktower, Croydon Airport",
      area: "Croydon",
      postcode: "CR0 0XZ",
    },
    features: ["independent", "community", "volunteer-run"],
  },
  createScraper: () => createDavidLeanScraper(),
};

const main = createMain(config, { useValidation: true });
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
