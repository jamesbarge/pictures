/**
 * Snapshot Test CLI
 *
 * Usage:
 *   npx tsx src/scrapers/__tests__/run-snapshot.ts capture bfi-southbank
 *   npx tsx src/scrapers/__tests__/run-snapshot.ts compare bfi-southbank
 *   npx tsx src/scrapers/__tests__/run-snapshot.ts list
 */

import {
  createSnapshot,
  saveSnapshot,
  loadSnapshot,
  compareSnapshots,
  listSnapshots,
  printSnapshot,
  printComparison,
} from "./snapshot";

// Import scraper factories - add more as needed
import { createBFIScraper } from "../cinemas/bfi";
import { createRioScraper } from "../cinemas/rio";
import { createGenesisScraper } from "../cinemas/genesis";
import { createPrinceCharlesScraper } from "../cinemas/prince-charles";
import { createICAScraper } from "../cinemas/ica";
import { createBarbicanScraper } from "../cinemas/barbican";
import { createPeckhamplexScraper } from "../cinemas/peckhamplex";
import { createNickelScraper } from "../cinemas/the-nickel";
import { createElectricScraper } from "../cinemas/electric";
import { createLexiScraper } from "../cinemas/lexi";
import { createGardenCinemaScraper } from "../cinemas/garden";

// ============================================================================
// Scraper Registry
// ============================================================================

interface ScraperEntry {
  cinemaId: string;
  name: string;
  createScraper: (venueId?: string) => { scrape: () => Promise<unknown[]> };
  venues?: string[];
}

const SCRAPERS: ScraperEntry[] = [
  // Playwright-based (slower)
  {
    cinemaId: "bfi-southbank",
    name: "BFI Southbank",
    createScraper: () => createBFIScraper("bfi-southbank"),
  },
  {
    cinemaId: "bfi-imax",
    name: "BFI IMAX",
    createScraper: () => createBFIScraper("bfi-imax"),
  },
  // Cheerio-based (faster)
  {
    cinemaId: "rio-dalston",
    name: "Rio Cinema",
    createScraper: () => createRioScraper(),
  },
  {
    cinemaId: "genesis-mile-end",
    name: "Genesis Cinema",
    createScraper: () => createGenesisScraper(),
  },
  {
    cinemaId: "prince-charles",
    name: "Prince Charles Cinema",
    createScraper: () => createPrinceCharlesScraper(),
  },
  {
    cinemaId: "ica",
    name: "ICA Cinema",
    createScraper: () => createICAScraper(),
  },
  {
    cinemaId: "barbican",
    name: "Barbican Cinema",
    createScraper: () => createBarbicanScraper(),
  },
  {
    cinemaId: "peckhamplex",
    name: "Peckham Plex",
    createScraper: () => createPeckhamplexScraper(),
  },
  {
    cinemaId: "nickel",
    name: "The Nickel",
    createScraper: () => createNickelScraper(),
  },
  {
    cinemaId: "electric-portobello",
    name: "Electric Cinema Portobello",
    createScraper: () => createElectricScraper(),
  },
  {
    cinemaId: "lexi",
    name: "The Lexi Cinema",
    createScraper: () => createLexiScraper(),
  },
  {
    cinemaId: "garden",
    name: "Garden Cinema",
    createScraper: () => createGardenCinemaScraper(),
  },
];

function getScraperEntry(cinemaId: string): ScraperEntry | undefined {
  return SCRAPERS.find((s) => s.cinemaId === cinemaId);
}

// ============================================================================
// Commands
// ============================================================================

async function captureSnapshot(cinemaId: string): Promise<void> {
  const entry = getScraperEntry(cinemaId);
  if (!entry) {
    console.error(`Unknown cinema: ${cinemaId}`);
    console.log("Available cinemas:", SCRAPERS.map((s) => s.cinemaId).join(", "));
    process.exit(1);
  }

  console.log(`📸 Capturing snapshot for ${entry.name}...`);

  try {
    const scraper = entry.createScraper();
    const screenings = await scraper.scrape();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = createSnapshot(cinemaId, screenings as any);
    const filePath = saveSnapshot(snapshot);

    printSnapshot(snapshot);
    console.log(`✅ Saved to: ${filePath}`);
  } catch (error) {
    console.error(`❌ Failed to capture snapshot:`, error);
    process.exit(1);
  }
}

async function compareSnapshot(cinemaId: string): Promise<void> {
  const entry = getScraperEntry(cinemaId);
  if (!entry) {
    console.error(`Unknown cinema: ${cinemaId}`);
    console.log("Available cinemas:", SCRAPERS.map((s) => s.cinemaId).join(", "));
    process.exit(1);
  }

  const baseline = loadSnapshot(cinemaId);
  if (!baseline) {
    console.error(`No baseline snapshot found for ${cinemaId}`);
    console.log("Run: npx tsx src/scrapers/__tests__/run-snapshot.ts capture", cinemaId);
    process.exit(1);
  }

  console.log(`🔍 Comparing ${entry.name} against baseline...`);

  try {
    const scraper = entry.createScraper();
    const screenings = await scraper.scrape();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comparison = compareSnapshots(cinemaId, screenings as any);
    printComparison(comparison);

    if (!comparison.match) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Failed to compare snapshot:`, error);
    process.exit(1);
  }
}

function listAllSnapshots(): void {
  const snapshots = listSnapshots();

  if (snapshots.length === 0) {
    console.log("No snapshots found.");
    console.log("\nAvailable cinemas to capture:");
    SCRAPERS.forEach((s) => console.log(`  - ${s.cinemaId} (${s.name})`));
    return;
  }

  console.log("📋 Available snapshots:\n");
  for (const cinemaId of snapshots) {
    const snapshot = loadSnapshot(cinemaId);
    if (snapshot) {
      const date = snapshot.capturedAt.split("T")[0];
      console.log(`  ${cinemaId}: ${snapshot.screeningCount} screenings (captured ${date})`);
    }
  }

  console.log("\nRegistered scrapers not yet captured:");
  const uncaptured = SCRAPERS.filter((s) => !snapshots.includes(s.cinemaId));
  uncaptured.forEach((s) => console.log(`  - ${s.cinemaId}`));
}

async function captureAll(): Promise<void> {
  console.log("📸 Capturing snapshots for all registered scrapers...\n");

  const results: { cinemaId: string; success: boolean; count: number }[] = [];

  for (const entry of SCRAPERS) {
    console.log(`\n→ ${entry.name}...`);
    try {
      const scraper = entry.createScraper();
      const screenings = await scraper.scrape();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const snapshot = createSnapshot(entry.cinemaId, screenings as any);
      saveSnapshot(snapshot);
      results.push({ cinemaId: entry.cinemaId, success: true, count: snapshot.screeningCount });
      console.log(`  ✅ ${snapshot.screeningCount} screenings`);
    } catch (error) {
      results.push({ cinemaId: entry.cinemaId, success: false, count: 0 });
      console.log(`  ❌ Failed:`, error instanceof Error ? error.message : error);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  console.log("=".repeat(60));
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  console.log(`✅ Captured: ${succeeded.length}/${results.length}`);
  if (failed.length > 0) {
    console.log(`❌ Failed: ${failed.map((r) => r.cinemaId).join(", ")}`);
  }
}

async function compareAll(): Promise<void> {
  console.log("🔍 Comparing all scrapers against baselines...\n");

  const snapshots = listSnapshots();
  if (snapshots.length === 0) {
    console.error("No baseline snapshots found. Run capture-all first.");
    process.exit(1);
  }

  const results: { cinemaId: string; match: boolean; error?: string }[] = [];

  for (const cinemaId of snapshots) {
    const entry = getScraperEntry(cinemaId);
    if (!entry) {
      console.log(`⚠️  ${cinemaId}: No scraper registered, skipping`);
      continue;
    }

    console.log(`\n→ ${entry.name}...`);
    try {
      const scraper = entry.createScraper();
      const screenings = await scraper.scrape();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const comparison = compareSnapshots(cinemaId, screenings as any);

      if (comparison.match) {
        console.log(`  ✅ Match (${comparison.currentCount} screenings)`);
        results.push({ cinemaId, match: true });
      } else {
        console.log(`  ⚠️  Differences found (${comparison.differences.length})`);
        comparison.differences.slice(0, 3).forEach((d) => {
          console.log(`     - ${d.description}`);
        });
        results.push({ cinemaId, match: false });
      }
    } catch (error) {
      console.log(`  ❌ Error:`, error instanceof Error ? error.message : error);
      results.push({ cinemaId, match: false, error: String(error) });
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  console.log("=".repeat(60));
  const matches = results.filter((r) => r.match);
  const diffs = results.filter((r) => !r.match && !r.error);
  const errors = results.filter((r) => r.error);

  console.log(`✅ Matches:     ${matches.length}/${results.length}`);
  console.log(`⚠️  Differences: ${diffs.length}/${results.length}`);
  console.log(`❌ Errors:      ${errors.length}/${results.length}`);

  if (diffs.length > 0 || errors.length > 0) {
    process.exit(1);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "capture":
      if (args.length === 0) {
        console.error("Usage: capture <cinema-id>");
        process.exit(1);
      }
      await captureSnapshot(args[0]);
      break;

    case "compare":
      if (args.length === 0) {
        console.error("Usage: compare <cinema-id>");
        process.exit(1);
      }
      await compareSnapshot(args[0]);
      break;

    case "list":
      listAllSnapshots();
      break;

    case "capture-all":
      await captureAll();
      break;

    case "compare-all":
      await compareAll();
      break;

    default:
      console.log("Scraper Snapshot Testing");
      console.log("");
      console.log("Commands:");
      console.log("  capture <cinema-id>  - Capture a baseline snapshot");
      console.log("  compare <cinema-id>  - Compare against baseline");
      console.log("  list                 - List available snapshots");
      console.log("  capture-all          - Capture all registered scrapers");
      console.log("  compare-all          - Compare all against baselines");
      console.log("");
      console.log("Examples:");
      console.log("  npx tsx src/scrapers/__tests__/run-snapshot.ts capture bfi-southbank");
      console.log("  npx tsx src/scrapers/__tests__/run-snapshot.ts compare-all");
      break;
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
