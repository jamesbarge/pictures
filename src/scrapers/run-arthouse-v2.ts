/**
 * Run Arthouse Crouch End Scraper (v2 - using runner factory)
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createArtHouseCrouchEndScraper } from "./cinemas/arthouse-crouch-end";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "arthouse-crouch-end",
    name: "ArtHouse Crouch End",
    shortName: "ArtHouse",
    website: "https://www.arthousecrouchend.co.uk",
    address: {
      street: "159A Tottenham Lane",
      area: "Crouch End",
      postcode: "N8 9BT",
    },
    features: ["independent", "art-house", "cafe-bar"],
  },
  createScraper: () => createArtHouseCrouchEndScraper(),
};

const main = createMain(config, { useValidation: true });
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
