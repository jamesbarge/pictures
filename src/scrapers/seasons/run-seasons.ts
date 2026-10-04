/**
 * Run one venue's season scraper, save its seasons and link them to existing films.
 *
 * Usage: npm run scrape:<venue>-seasons
 *        (bfi, close-up, barbican, pcc, ica; each calls `run-seasons.ts <venue>`)
 */

import { BFISeasonScraper } from "./bfi";
import { CloseUpSeasonScraper } from "./close-up";
import { BarbicanSeasonScraper } from "./barbican";
import { PCCSeasonScraper } from "./pcc";
import { ICASeasonScraper } from "./ica";
import { processSeasons } from "./pipeline";

export const SEASON_SCRAPERS = {
  bfi: BFISeasonScraper,
  "close-up": CloseUpSeasonScraper,
  barbican: BarbicanSeasonScraper,
  pcc: PCCSeasonScraper,
  ica: ICASeasonScraper,
};

async function main(venue: string) {
  const Scraper = SEASON_SCRAPERS[venue as keyof typeof SEASON_SCRAPERS];
  if (!Scraper) {
    console.error(`Usage: run-seasons.ts <${Object.keys(SEASON_SCRAPERS).join("|")}>`);
    process.exit(1);
  }

  console.log(`🎬 Starting ${venue} season scraper...\n`);
  const scraper = new Scraper();

  console.log("Running health check...");
  const healthy = await scraper.healthCheck();
  console.log(`Health check: ${healthy ? "✓ OK" : "✗ FAILED"}\n`);
  if (!healthy) {
    console.error("Health check failed");
    process.exit(1);
  }

  const seasons = await scraper.scrape();
  console.log(`\nFound ${seasons.length} seasons total`);
  for (const season of seasons) {
    console.log(`  - ${season.name}: ${season.films.length} films`);
  }

  console.log("\nProcessing seasons...");
  const result = await processSeasons(seasons);

  console.log("\nPipeline Results:");
  console.log(`  Created: ${result.created} seasons`);
  console.log(`  Updated: ${result.updated} seasons`);
  console.log(`  Films linked: ${result.filmsLinked}`);
  console.log(`  Films unmatched: ${result.filmsUnmatched}`);

  console.log(`\n✅ ${venue} season scrape complete!`);
  process.exit(0);
}

// Run if called directly (not when imported as a module)
if (process.argv[1]?.endsWith("run-seasons.ts")) {
  main(process.argv[2] ?? "").catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
