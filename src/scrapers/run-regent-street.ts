/**
 * Run Regent Street Cinema Scraper
 *
 * Usage:
 *   npm run scrape:regent-street
 */

import { createRegentStreetScraper } from "./cinemas/regent-street";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

const VENUE = {
  id: "regent-street-cinema",
  name: "Regent Street Cinema",
  shortName: "Regent Street",
  website: "https://www.regentstreetcinema.com",
  address: {
    street: "307 Regent Street",
    area: "Marylebone",
    postcode: "W1B 2HW",
  },
  coordinates: {
    lat: 51.5176,
    lng: -0.1421,
  },
  features: ["independent", "historic", "arthouse", "35mm", "16mm", "4k", "university"],
};

async function main() {
  console.log("[regent-street] Starting Regent Street Cinema scrape...");

  const scraper = createRegentStreetScraper();

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

    console.log(`[regent-street] Complete: ${screenings.length} screenings`);
    return results;
  } catch (error) {
    console.error("[regent-street] Error:", error);
    throw error;
  }
}

main().catch(console.error);
