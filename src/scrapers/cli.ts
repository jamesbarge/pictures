#!/usr/bin/env npx tsx
/**
 * Unified Scraper CLI
 *
 * Usage:
 *   npm run scrape <cinema-id>       Run a single cinema scraper
 *   npm run scrape --all             Run all scrapers
 *   npm run scrape --list            List available scrapers
 *   npm run scrape --chains          Run chain scrapers only
 *   npm run scrape --independents    Run independent cinema scrapers only
 */

import {
  SCRAPER_REGISTRY,
  getScraperByCliId,
  getScraperCliId,
  type ScraperRegistryEntry,
} from "./registry";
import { runScraper, type ScraperRunnerConfig } from "./runner-factory";

type CliScraperType = "independent" | "chain";

function getCliEntries(type?: CliScraperType): ScraperRegistryEntry[] {
  return SCRAPER_REGISTRY.filter((entry) => {
    if (entry.wave === "enrichment") return false;
    if (!type) return true;
    return type === "chain" ? entry.type === "chain" : entry.type !== "chain";
  });
}

function getConfigName(config: ScraperRunnerConfig): string {
  if (config.type === "chain") return config.chainName;
  if (config.type === "single") return config.venue.name;
  return config.venues.map((venue) => venue.shortName || venue.name).join(" + ");
}

function getEntryName(entry: ScraperRegistryEntry): string {
  return getConfigName(entry.buildConfig());
}

function printHelp(): void {
  console.log(`
Unified Scraper CLI

Usage:
  npm run scrape <cinema-id>       Run a single cinema scraper
  npm run scrape --all             Run all scrapers
  npm run scrape --list            List available scrapers
  npm run scrape --chains          Run chain scrapers only
  npm run scrape --independents    Run independent cinema scrapers only

Examples:
  npm run scrape rio
  npm run scrape pcc
  npm run scrape --list
  npm run scrape --all
`);
}

function listScrapers(): void {
  console.log("\nAvailable scrapers:\n");

  const independents = getCliEntries("independent");
  const chains = getCliEntries("chain");

  console.log("Independent Cinemas:");
  independents.forEach((entry) => {
    console.log(`  ${getScraperCliId(entry).padEnd(20)} ${getEntryName(entry)}`);
  });

  console.log("\nChain Cinemas:");
  chains.forEach((entry) => {
    console.log(`  ${getScraperCliId(entry).padEnd(20)} ${getEntryName(entry)}`);
  });

  console.log(`\nTotal: ${independents.length + chains.length} scrapers\n`);
}

async function runSingle(id: string): Promise<void> {
  const entry = getScraperByCliId(id);
  if (!entry) {
    console.error(`Unknown scraper: ${id}`);
    console.log("Run 'npm run scrape --list' to see available scrapers");
    process.exit(1);
  }

  const config = entry.buildConfig();
  const name = getConfigName(config);
  console.log(`Running ${name} scraper...\n`);

  try {
    await runScraper(config, { useValidation: true });
  } catch (error) {
    console.error(`Error running ${name}:`, error);
    process.exit(1);
  }
}

async function runMultiple(filter?: CliScraperType): Promise<void> {
  const entries = getCliEntries(filter);

  console.log(`Running ${entries.length} scrapers...\n`);

  const results: { id: string; success: boolean; screenings: number }[] = [];

  for (const entry of entries) {
    const config = entry.buildConfig();
    const id = getScraperCliId(entry);
    const name = getConfigName(config);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`> ${name}`);
    console.log("=".repeat(60));

    try {
      const result = await runScraper(config, { useValidation: true });
      results.push({
        id,
        success: result.success,
        screenings: result.totalScreeningsFound,
      });
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      results.push({ id, success: false, screenings: 0 });
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const succeeded = results.filter((result) => result.success);
  const failed = results.filter((result) => !result.success);
  const totalScreenings = results.reduce((sum, result) => sum + result.screenings, 0);

  console.log(`Succeeded: ${succeeded.length}/${results.length}`);
  console.log(`Failed: ${failed.length}/${results.length}`);
  console.log(`Total screenings: ${totalScreenings}`);

  if (failed.length > 0) {
    console.log(`\nFailed scrapers: ${failed.map((result) => result.id).join(", ")}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  if (args.includes("--list") || args.includes("-l")) {
    listScrapers();
    return;
  }

  if (args.includes("--all") || args.includes("-a")) {
    await runMultiple();
    return;
  }

  if (args.includes("--independents") || args.includes("-i")) {
    await runMultiple("independent");
    return;
  }

  if (args.includes("--chains") || args.includes("-c")) {
    await runMultiple("chain");
    return;
  }

  const scraperId = args[0];
  if (scraperId && !scraperId.startsWith("-")) {
    await runSingle(scraperId);
    return;
  }

  console.error("Unknown command. Run --help for usage.");
  process.exit(1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
