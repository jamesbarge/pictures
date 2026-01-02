/**
 * Run BFI Scraper (v2 - using runner factory)
 *
 * Usage:
 *   npm run scrape:bfi-v2              # Scrape both venues
 *   npm run scrape:bfi-v2 -- southbank # Scrape specific venue
 */

import { runScraper, createMain, type MultiVenueConfig } from "./runner-factory";
import { createBFIScraper } from "./cinemas/bfi";

// Define BFI venues
const BFI_VENUES = [
  {
    id: "bfi-southbank",
    name: "BFI Southbank",
    shortName: "BFI",
    website: "https://whatson.bfi.org.uk/Online",
    address: {
      street: "Belvedere Road",
      area: "South Bank",
      postcode: "SE1 8XT",
    },
    features: ["repertory", "35mm", "70mm", "bar", "cafe", "archive"],
  },
  {
    id: "bfi-imax",
    name: "BFI IMAX",
    shortName: "IMAX",
    website: "https://whatson.bfi.org.uk/imax/Online",
    address: {
      street: "1 Charlie Chaplin Walk",
      area: "Waterloo",
      postcode: "SE1 8XR",
    },
    features: ["imax", "3d", "dolby-atmos"],
  },
];

// Configure the multi-venue scraper
const config: MultiVenueConfig = {
  type: "multi",
  venues: BFI_VENUES,
  createScraper: (venueId: string) => createBFIScraper(venueId as "bfi-southbank" | "bfi-imax"),
};

// Create and run main function
const main = createMain(config, {
  useValidation: true,
  venuePrefix: "bfi-",
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
