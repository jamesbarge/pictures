/**
 * Run Garden Cinema scraper
 */

import { createGardenCinemaScraper } from "./cinemas/garden";
import { processScreenings } from "./pipeline";

async function main() {
  console.log("🎬 Starting Garden Cinema scraper...\n");

  try {
    const scraper = createGardenCinemaScraper();

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
        console.log(`  ${i + 1}. ${s.filmTitle} - ${s.datetime.toISOString()}`);
      });
    }

    // Log unique films
    const uniqueFilms = new Set(rawScreenings.map((s) => s.filmTitle));
    console.log(`\n📽️  ${uniqueFilms.size} unique films`);

    // Process through pipeline
    if (rawScreenings.length > 0) {
      console.log("\nProcessing through pipeline...");
      const result = await processScreenings("garden-cinema", rawScreenings);
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

main().then(() => process.exit(0));
