/**
 * Run Castle Sidcup Scraper
 *
 * Usage:
 *   npm run scrape:castle-sidcup
 */

import { createCastleSidcupScraper, CASTLE_SIDCUP_VENUE } from "./cinemas/castle-sidcup";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

async function main() {
  console.log("[castle-sidcup] Starting Castle Sidcup scrape...");

  const scraper = createCastleSidcupScraper();

  try {
    // Ensure cinema exists in database
    await ensureCinemaExists({
      id: CASTLE_SIDCUP_VENUE.id,
      name: CASTLE_SIDCUP_VENUE.name,
      shortName: CASTLE_SIDCUP_VENUE.shortName,
      website: CASTLE_SIDCUP_VENUE.website,
      address: {
        street: CASTLE_SIDCUP_VENUE.address,
        area: CASTLE_SIDCUP_VENUE.area,
        postcode: CASTLE_SIDCUP_VENUE.postcode,
      },
      features: CASTLE_SIDCUP_VENUE.features,
    });

    // Run scraper
    const screenings = await scraper.scrape();

    // Save to database
    const results = await saveScreenings(CASTLE_SIDCUP_VENUE.id, screenings);

    console.log(`[castle-sidcup] Complete: ${screenings.length} screenings`);
    return results;
  } catch (error) {
    console.error("[castle-sidcup] Error:", error);
    throw error;
  }
}

main().catch(console.error);
