/**
 * Run Rich Mix Cinema Scraper
 *
 * Usage:
 *   npm run scrape:rich-mix
 */

import { createRichMixScraper } from "./cinemas/rich-mix";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

const VENUE = {
  id: "rich-mix",
  name: "Rich Mix",
  shortName: "Rich Mix",
  website: "https://richmix.org.uk",
  address: {
    street: "35-47 Bethnal Green Rd",
    area: "Shoreditch",
    postcode: "E1 6LA",
  },
  coordinates: {
    lat: 51.5246,
    lng: -0.0713,
  },
  features: ["independent", "arthouse", "35mm", "4k", "community"],
};

async function main() {
  console.log("[rich-mix] Starting Rich Mix Cinema scrape...");

  const scraper = createRichMixScraper();

  try {
    // Ensure cinema exists in database
    await ensureCinemaExists({
      id: VENUE.id,
      name: VENUE.name,
      shortName: VENUE.shortName,
      website: VENUE.website,
      address: VENUE.address,
      features: VENUE.features,
    });

    // Run scraper
    const screenings = await scraper.scrape();

    // Save to database
    const results = await saveScreenings(VENUE.id, screenings);

    console.log(`[rich-mix] Complete: ${screenings.length} screenings`);
    return results;
  } catch (error) {
    console.error("[rich-mix] Error:", error);
    throw error;
  }
}

main().catch(console.error);
