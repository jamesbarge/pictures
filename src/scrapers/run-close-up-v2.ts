/**
 * Run Close-Up Film Centre Scraper (v2 - using runner factory)
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createCloseUpCinemaScraper } from "./cinemas/close-up";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "close-up",
    name: "Close-Up Film Centre",
    shortName: "Close-Up",
    website: "https://www.closeupfilmcentre.com",
    address: {
      street: "97 Sclater Street",
      area: "Shoreditch",
      postcode: "E1 6HR",
    },
    features: ["independent", "art-house", "cafe", "community"],
  },
  createScraper: () => createCloseUpCinemaScraper(),
};

const main = createMain(config, { useValidation: true });
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
