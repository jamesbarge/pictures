/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Run Lexi Cinema Scraper
 *
 * Usage:
 *   npm run scrape:lexi
 */

import { createLexiScraper, LEXI_VENUE } from "./cinemas/lexi";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

async function main() {
  console.log(`[lexi] Starting Lexi Cinema scrape...`);

  const scraper = createLexiScraper();

  // Ensure cinema exists in database
  await ensureCinemaExists({
    id: LEXI_VENUE.id,
    name: LEXI_VENUE.name,
    shortName: LEXI_VENUE.shortName,
    website: LEXI_VENUE.website,
    address: {
      street: LEXI_VENUE.address,
      area: LEXI_VENUE.area,
      postcode: LEXI_VENUE.postcode,
    },
    features: LEXI_VENUE.features,
  });

  // Scrape
  const screenings = await scraper.scrape();

  // Save
  if (screenings.length > 0) {
    await saveScreenings(LEXI_VENUE.id, screenings);
  }

  console.log(`[lexi] Complete: ${screenings.length} screenings`);
}

main().catch((error) => {
  console.error("[lexi] Fatal error:", error);
  process.exit(1);
});
