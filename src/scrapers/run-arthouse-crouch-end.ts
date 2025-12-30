/**
 * Run ArtHouse Crouch End Scraper
 *
 * Usage:
 *   npm run scrape:arthouse
 */

import { createArtHouseCrouchEndScraper } from "./cinemas/arthouse-crouch-end";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

const VENUE = {
  id: "arthouse-crouch-end",
  name: "ArtHouse Crouch End",
  shortName: "ArtHouse",
  website: "https://www.arthousecrouchend.co.uk",
  address: {
    street: "159A Tottenham Lane",
    area: "Crouch End",
    postcode: "N8 9BT",
  },
  features: ["independent", "community", "arthouse", "bar", "live-events"],
};

async function main() {
  console.log("[arthouse-crouch-end] Starting ArtHouse Crouch End scrape...");

  const scraper = createArtHouseCrouchEndScraper();

  // Ensure cinema exists in database
  await ensureCinemaExists({
    id: VENUE.id,
    name: VENUE.name,
    shortName: VENUE.shortName,
    website: VENUE.website,
    address: VENUE.address,
    features: VENUE.features,
  });

  // Scrape
  const screenings = await scraper.scrape();

  // Save
  if (screenings.length > 0) {
    await saveScreenings(VENUE.id, screenings);
  }

  console.log("[arthouse-crouch-end] Complete: " + screenings.length + " screenings");
}

main().catch((error) => {
  console.error("[arthouse-crouch-end] Fatal error:", error);
  process.exit(1);
});
