/**
 * Run script for BFI Season Scraper
 *
 * Usage: npm run scrape:bfi-seasons
 *
 * Scrapes director seasons and retrospectives from BFI Southbank,
 * then saves them to the database and links to existing films.
 */

import { createBFISeasonScraper } from "./bfi";
import { processSeasons } from "./pipeline";

async function main() {
  console.log("🎬 Starting BFI Season scraper...\n");

  const scraper = createBFISeasonScraper();

  // Health check first
  console.log("Running health check...");
  const healthy = await scraper.healthCheck();
  console.log(`Health check: ${healthy ? "✓ OK" : "✗ FAILED"}\n`);

  if (!healthy) {
    console.error("Health check failed - BFI may be blocking requests");
    process.exit(1);
  }

  // Run the scrape
  const seasons = await scraper.scrape();

  console.log(`\nFound ${seasons.length} seasons total`);
  for (const season of seasons) {
    console.log(`  - ${season.name}: ${season.films.length} films`);
  }

  // Save to database
  console.log("\nProcessing seasons...");
  const result = await processSeasons(seasons);

  console.log("\nPipeline Results:");
  console.log(`  Created: ${result.created} seasons`);
  console.log(`  Updated: ${result.updated} seasons`);
  console.log(`  Films linked: ${result.filmsLinked}`);
  console.log(`  Films unmatched: ${result.filmsUnmatched}`);

  console.log("\n✅ BFI Season scrape complete!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
