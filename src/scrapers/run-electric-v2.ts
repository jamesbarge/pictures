/**
 * Run Electric Cinema Scraper (v2 - using runner factory)
 *
 * Usage:
 *   npm run scrape:electric        # Scrape both venues
 *   npm run scrape:electric -- portobello  # Scrape specific venue
 */

import { createMain, type MultiVenueConfig } from "./runner-factory";
import { createElectricScraperV2 } from "./cinemas/electric-v2";

// Define Electric venues
const ELECTRIC_VENUES = [
  {
    id: "electric-portobello",
    name: "Electric Cinema Portobello",
    shortName: "Electric",
    website: "https://www.electriccinema.co.uk",
    address: {
      street: "191 Portobello Road",
      area: "Notting Hill",
      postcode: "W11 2ED",
    },
    features: ["independent", "luxury", "historic", "bar", "beds"],
  },
  {
    id: "electric-white-city",
    name: "Electric Cinema White City",
    shortName: "Electric WC",
    website: "https://www.electriccinema.co.uk",
    address: {
      street: "Television Centre",
      area: "White City",
      postcode: "W12 7SL",
    },
    features: ["independent", "luxury", "bar", "beds"],
  },
];

// Configure the multi-venue scraper
const config: MultiVenueConfig = {
  type: "multi",
  venues: ELECTRIC_VENUES,
  createScraper: (venueId: string) => createElectricScraperV2(venueId),
};

const main = createMain(config, {
  useValidation: true,
  venuePrefix: "electric-",
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
