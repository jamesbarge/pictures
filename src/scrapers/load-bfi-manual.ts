/**
 * Load manually extracted BFI screening data into the database
 *
 * This is a workaround for Cloudflare protection that blocks automated scraping.
 * The data in bfi-manual-screenings.json is extracted using MCP Playwright
 * which can bypass Cloudflare's bot detection.
 *
 * Usage: npm run load:bfi-manual
 */

import { processScreenings } from "./pipeline";
import type { RawScreening } from "./types";
import bfiData from "./data/bfi-manual-screenings.json";

async function loadBFIManualData() {
  console.log("🎬 Loading BFI manual screening data...\n");
  console.log(`Data extracted at: ${bfiData.extractedAt}`);
  console.log(`Venue: ${bfiData.venue}`);
  console.log(`Total screenings: ${bfiData.screenings.length}\n`);

  // Convert JSON data to RawScreening format
  const rawScreenings: RawScreening[] = bfiData.screenings.map((s) => ({
    filmTitle: s.filmTitle,
    datetime: new Date(s.datetime),
    screen: s.screen,
    bookingUrl: s.bookingUrl,
    eventType: (s as { eventType?: string }).eventType,
    sourceId: `bfi-southbank-${s.filmTitle.toLowerCase().replace(/\s+/g, "-")}-${s.datetime}`,
  }));

  // Filter out past screenings
  const now = new Date();
  const futureScreenings = rawScreenings.filter((s) => s.datetime > now);

  console.log(`Future screenings: ${futureScreenings.length}`);

  if (futureScreenings.length === 0) {
    console.log("No future screenings to load.");
    return;
  }

  // Process using existing pipeline
  try {
    const result = await processScreenings(bfiData.venue, futureScreenings);
    console.log("\n✅ BFI data loaded successfully!");
    console.log(`Screenings added: ${result.added}`);
    console.log(`Screenings updated: ${result.updated}`);
  } catch (error) {
    console.error("Error loading BFI data:", error);
    throw error;
  }
}

loadBFIManualData().catch(console.error);
