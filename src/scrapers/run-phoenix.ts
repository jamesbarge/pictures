/**
 * Run Phoenix Cinema Scraper
 *
 * Usage:
 *   npm run scrape:phoenix
 */

import { createPhoenixScraper } from "./cinemas/phoenix";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

const VENUE = {
  id: "phoenix-east-finchley",
  name: "Phoenix Cinema",
  shortName: "Phoenix",
  website: "https://phoenixcinema.co.uk",
  address: {
    street: "52 High Rd",
    area: "East Finchley",
    postcode: "N2 9PJ",
  },
  features: ["independent", "community", "arthouse", "35mm", "historic"],
};

async function main() {
  console.log("[phoenix] Starting Phoenix Cinema scrape...");

  const scraper = createPhoenixScraper();

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

  console.log("[phoenix] Complete: " + screenings.length + " screenings");
}

main().catch((error) => {
  console.error("[phoenix] Fatal error:", error);
  process.exit(1);
});
