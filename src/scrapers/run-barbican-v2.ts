/**
 * Run Barbican Cinema Scraper (v2 - using runner factory)
 *
 * Usage:
 *   npm run scrape:barbican-v2
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createBarbicanScraper } from "./cinemas/barbican";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "barbican",
    name: "Barbican Cinema",
    shortName: "Barbican",
    website: "https://www.barbican.org.uk",
    address: {
      street: "Silk Street",
      area: "City of London",
      postcode: "EC2Y 8DS",
    },
    features: ["arts-centre", "repertory", "world-cinema", "accessible"],
  },
  createScraper: () => createBarbicanScraper(),
};

const main = createMain(config, {
  useValidation: true,
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
