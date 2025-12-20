/**
 * Run Prince Charles Cinema Scraper
 */

import { createPrinceCharlesScraper } from "./cinemas/prince-charles";
import { processScreenings } from "./pipeline";

async function runPCCScraper() {
  console.log("🎬 Starting Prince Charles Cinema scraper...\n");

  try {
    const scraper = createPrinceCharlesScraper();

    // Health check
    const isHealthy = await scraper.healthCheck();
    console.log(`Health check: ${isHealthy ? "✓ OK" : "✗ Failed"}`);

    if (!isHealthy) {
      console.log("Site not accessible, aborting.");
      return;
    }

    // Scrape
    const rawScreenings = await scraper.scrape();
    console.log(`\nFound ${rawScreenings.length} raw screenings`);

    // Show sample
    if (rawScreenings.length > 0) {
      console.log("\nSample screenings:");
      rawScreenings.slice(0, 5).forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.filmTitle} - ${s.datetime.toISOString()} ${s.format || ""}`);
      });
    }

    // Process through pipeline
    if (rawScreenings.length > 0) {
      console.log("\nProcessing through pipeline...");
      const result = await processScreenings("prince-charles", rawScreenings);
      console.log(`\nPipeline result:`);
      console.log(`  Added: ${result.added}`);
      console.log(`  Updated: ${result.updated}`);
      console.log(`  Failed: ${result.failed}`);
    }

  } catch (error) {
    console.error("Error:", error);
  }

  console.log("\n✅ Done!");
}

runPCCScraper().then(() => process.exit(0));
