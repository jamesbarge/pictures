/**
 * Run Coldharbour Blue Cinema Scraper
 *
 * Usage:
 *   npm run scrape:coldharbour-blue
 */

import { createColdharbourBlueScraper, COLDHARBOUR_VENUE } from "./cinemas/coldharbour-blue";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

async function main() {
  console.log(`[coldharbour-blue] Starting Coldharbour Blue scrape...`);

  const scraper = createColdharbourBlueScraper();

  // Ensure cinema exists in database
  await ensureCinemaExists({
    id: COLDHARBOUR_VENUE.id,
    name: COLDHARBOUR_VENUE.name,
    shortName: COLDHARBOUR_VENUE.shortName,
    website: COLDHARBOUR_VENUE.website,
    address: {
      street: COLDHARBOUR_VENUE.address,
      area: COLDHARBOUR_VENUE.area,
      postcode: COLDHARBOUR_VENUE.postcode,
    },
    features: COLDHARBOUR_VENUE.features,
  });

  // Scrape
  const screenings = await scraper.scrape();

  // Save
  if (screenings.length > 0) {
    await saveScreenings(COLDHARBOUR_VENUE.id, screenings);
  }

  console.log(`[coldharbour-blue] Complete: ${screenings.length} screenings`);
}

main().catch((error) => {
  console.error("[coldharbour-blue] Fatal error:", error);
  process.exit(1);
});
