/**
 * Run Riverside Studios Scraper
 *
 * Usage:
 *   npm run scrape:riverside
 */

import { createRiversideStudiosScraper } from "./cinemas/riverside-studios";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

const VENUE = {
  id: "riverside-studios",
  name: "Riverside Studios",
  shortName: "Riverside",
  website: "https://riversidestudios.co.uk",
  address: {
    street: "101 Queen Caroline St",
    area: "Hammersmith",
    postcode: "W6 9BN",
  },
  coordinates: {
    lat: 51.4884,
    lng: -0.2341,
  },
  features: ["independent", "arthouse", "4k", "community"],
};

async function main() {
  console.log("[riverside] Starting Riverside Studios scrape...");

  const scraper = createRiversideStudiosScraper();

  try {
    // Ensure cinema exists in database
    await ensureCinemaExists({
      id: VENUE.id,
      name: VENUE.name,
      shortName: VENUE.shortName,
      website: VENUE.website,
      address: `${VENUE.address.street}, ${VENUE.address.area}, ${VENUE.address.postcode}`,
      features: VENUE.features,
    });

    // Run scraper
    const screenings = await scraper.scrape();

    // Save to database
    const results = await saveScreenings(VENUE.id, screenings);

    console.log(`[riverside] Complete: ${screenings.length} screenings`);
    return results;
  } catch (error) {
    console.error("[riverside] Error:", error);
    throw error;
  }
}

main().catch(console.error);
