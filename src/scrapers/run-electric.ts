// @ts-nocheck
/**
 * Run Electric Cinema Scraper
 *
 * Usage:
 *   npm run scrape:electric
 */

import { createElectricScraper, ELECTRIC_VENUES } from "./cinemas/electric";
import { saveScreenings, ensureCinemaExists } from "./pipeline";

async function main() {
  console.log(`[electric] Starting Electric Cinema scrape...`);

  const scraper = createElectricScraper();

  // Ensure all venues exist in database
  for (const venue of ELECTRIC_VENUES.filter(v => v.active)) {
    await ensureCinemaExists({
      id: venue.id,
      name: venue.name,
      shortName: venue.shortName,
      website: `https://www.electriccinema.co.uk/programme/list/${venue.slug}/`,
      address: {
        street: venue.address,
        area: venue.area,
        postcode: venue.postcode,
      },
      features: venue.features || [],
    });
  }

  // Scrape all venues
  const screenings = await scraper.scrape();

  // Group screenings by venue and save
  const byVenue = new Map<string, typeof screenings>();
  for (const screening of screenings) {
    // Determine venue from sourceId
    const venueId = screening.sourceId?.includes("portobello")
      ? "electric-portobello"
      : "electric-white-city";

    if (!byVenue.has(venueId)) {
      byVenue.set(venueId, []);
    }
    byVenue.get(venueId)!.push(screening);
  }

  let totalScreenings = 0;
  for (const [venueId, venueScreenings] of byVenue) {
    if (venueScreenings.length > 0) {
      await saveScreenings(venueId, venueScreenings);
      totalScreenings += venueScreenings.length;
    }
  }

  console.log(`[electric] Complete: ${totalScreenings} screenings`);
}

main().catch((error) => {
  console.error("[electric] Fatal error:", error);
  process.exit(1);
});
