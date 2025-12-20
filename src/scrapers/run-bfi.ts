/**
 * Run BFI Scraper
 * Scrapes BFI Southbank and BFI IMAX, processes through pipeline
 */

import { createBFIScraper } from "./cinemas/bfi";
import { processScreenings } from "./pipeline";

async function runBFIScraper() {
  console.log("🎬 Starting BFI scraper...\n");

  // Scrape BFI Southbank
  console.log("=".repeat(50));
  console.log("Scraping BFI Southbank...");
  console.log("=".repeat(50));

  try {
    const southbankScraper = createBFIScraper("bfi-southbank");

    // Health check first
    const isHealthy = await southbankScraper.healthCheck();
    console.log(`Health check: ${isHealthy ? "✓ OK" : "✗ Failed"}`);

    if (!isHealthy) {
      console.log("Skipping BFI Southbank - site not accessible\n");
    } else {
      const southbankScreenings = await southbankScraper.scrape();
      console.log(`Found ${southbankScreenings.length} screenings`);

      if (southbankScreenings.length > 0) {
        const result = await processScreenings("bfi-southbank", southbankScreenings);
        console.log(`Pipeline result: ${result.added} added, ${result.updated} updated, ${result.failed} failed`);
      }
    }
  } catch (error) {
    console.error("Error scraping BFI Southbank:", error);
  }

  console.log("\n");

  // Scrape BFI IMAX
  console.log("=".repeat(50));
  console.log("Scraping BFI IMAX...");
  console.log("=".repeat(50));

  try {
    const imaxScraper = createBFIScraper("bfi-imax");

    const isHealthy = await imaxScraper.healthCheck();
    console.log(`Health check: ${isHealthy ? "✓ OK" : "✗ Failed"}`);

    if (!isHealthy) {
      console.log("Skipping BFI IMAX - site not accessible\n");
    } else {
      const imaxScreenings = await imaxScraper.scrape();
      console.log(`Found ${imaxScreenings.length} screenings`);

      if (imaxScreenings.length > 0) {
        const result = await processScreenings("bfi-imax", imaxScreenings);
        console.log(`Pipeline result: ${result.added} added, ${result.updated} updated, ${result.failed} failed`);
      }
    }
  } catch (error) {
    console.error("Error scraping BFI IMAX:", error);
  }

  console.log("\n✅ BFI scrape complete!");
}

runBFIScraper()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
