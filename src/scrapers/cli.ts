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
 *
 * Examples:
 *   npm run scrape rio
 *   npm run scrape bfi-southbank
 *   npm run scrape --all
 */

import { runScraper, type SingleVenueConfig, type ScraperRunnerConfig } from "./runner-factory";

// ============================================================================
// Scraper Registry
// ============================================================================

interface ScraperDefinition {
  id: string;
  name: string;
  type: "independent" | "chain";
  createConfig: () => Promise<ScraperRunnerConfig>;
}

// Lazy imports to avoid loading all scrapers when only running one
const SCRAPERS: ScraperDefinition[] = [
  // Independent cinemas
  {
    id: "rio",
    name: "Rio Cinema",
    type: "independent",
    createConfig: async () => {
      const { createRioScraper } = await import("./cinemas/rio");
      return {
        type: "single",
        venue: {
          id: "rio-dalston",
          name: "Rio Cinema",
          shortName: "Rio",
          website: "https://riocinema.org.uk",
          address: { street: "107 Kingsland High Street", area: "Dalston", postcode: "E8 2PB" },
          features: ["independent", "repertory", "bar", "35mm", "art-deco"],
        },
        createScraper: () => createRioScraper(),
      } satisfies SingleVenueConfig;
    },
  },
  {
    id: "pcc",
    name: "Prince Charles Cinema",
    type: "independent",
    createConfig: async () => {
      const { createPrinceCharlesScraper } = await import("./cinemas/prince-charles");
      return {
        type: "single",
        venue: {
          id: "prince-charles",
          name: "Prince Charles Cinema",
          shortName: "PCC",
          website: "https://princecharlescinema.com",
          address: { street: "7 Leicester Place", area: "Leicester Square", postcode: "WC2H 7BY" },
          features: ["independent", "repertory", "sing-along", "marathons", "35mm", "70mm"],
        },
        createScraper: () => createPrinceCharlesScraper(),
      } satisfies SingleVenueConfig;
    },
  },
  {
    id: "ica",
    name: "ICA Cinema",
    type: "independent",
    createConfig: async () => {
      const { createICAScraper } = await import("./cinemas/ica");
      return {
        type: "single",
        venue: {
          id: "ica",
          name: "Institute of Contemporary Arts",
          shortName: "ICA",
          website: "https://www.ica.art",
          address: { street: "The Mall", area: "St James's", postcode: "SW1Y 5AH" },
          features: ["independent", "repertory", "art-house", "gallery"],
        },
        createScraper: () => createICAScraper(),
      } satisfies SingleVenueConfig;
    },
  },
  {
    id: "barbican",
    name: "Barbican Cinema",
    type: "independent",
    createConfig: async () => {
      const { createBarbicanScraper } = await import("./cinemas/barbican");
      return {
        type: "single",
        venue: {
          id: "barbican",
          name: "Barbican Cinema",
          shortName: "Barbican",
          website: "https://www.barbican.org.uk",
          address: { street: "Silk Street", area: "City of London", postcode: "EC2Y 8DS" },
          features: ["arts-centre", "repertory", "world-cinema", "accessible"],
        },
        createScraper: () => createBarbicanScraper(),
      } satisfies SingleVenueConfig;
    },
  },
  {
    id: "genesis",
    name: "Genesis Cinema",
    type: "independent",
    createConfig: async () => {
      const { createGenesisScraper } = await import("./cinemas/genesis");
      return {
        type: "single",
        venue: {
          id: "genesis",
          name: "Genesis Cinema",
          shortName: "Genesis",
          website: "https://genesiscinema.co.uk",
          address: { street: "93-95 Mile End Road", area: "Mile End", postcode: "E1 4UJ" },
          features: ["independent", "affordable", "5-screens"],
        },
        createScraper: () => createGenesisScraper(),
      } satisfies SingleVenueConfig;
    },
  },
  {
    id: "peckhamplex",
    name: "Peckhamplex",
    type: "independent",
    createConfig: async () => {
      const { createPeckhamplexScraper } = await import("./cinemas/peckhamplex");
      return {
        type: "single",
        venue: {
          id: "peckhamplex",
          name: "Peckhamplex",
          shortName: "Plex",
          website: "https://peckhamplex.london",
          address: { street: "95A Rye Lane", area: "Peckham", postcode: "SE15 4ST" },
          features: ["independent", "affordable", "community"],
        },
        createScraper: () => createPeckhamplexScraper(),
      } satisfies SingleVenueConfig;
    },
  },
  {
    id: "the-nickel",
    name: "The Nickel",
    type: "independent",
    createConfig: async () => {
      const { createNickelScraper, NICKEL_VENUE } = await import("./cinemas/the-nickel");
      return {
        type: "single",
        venue: {
          id: NICKEL_VENUE.id,
          name: NICKEL_VENUE.name,
          shortName: NICKEL_VENUE.shortName,
          website: NICKEL_VENUE.website,
          address: { street: NICKEL_VENUE.address, area: NICKEL_VENUE.area, postcode: NICKEL_VENUE.postcode },
          features: NICKEL_VENUE.features,
        },
        createScraper: () => createNickelScraper(),
      } satisfies SingleVenueConfig;
    },
  },
  {
    id: "electric",
    name: "Electric Cinema",
    type: "independent",
    createConfig: async () => {
      const { createElectricScraper } = await import("./cinemas/electric");
      return {
        type: "single",
        venue: {
          id: "electric-portobello",
          name: "Electric Cinema Portobello",
          shortName: "Electric",
          website: "https://www.electriccinema.co.uk",
          address: { street: "191 Portobello Road", area: "Notting Hill", postcode: "W11 2ED" },
          features: ["independent", "luxury", "historic", "bar"],
        },
        createScraper: () => createElectricScraper(),
      } satisfies SingleVenueConfig;
    },
  },
  {
    id: "lexi",
    name: "The Lexi Cinema",
    type: "independent",
    createConfig: async () => {
      const { createLexiScraper } = await import("./cinemas/lexi");
      return {
        type: "single",
        venue: {
          id: "lexi",
          name: "The Lexi Cinema",
          shortName: "Lexi",
          website: "https://thelexicinema.co.uk",
          address: { street: "194B Chamberlayne Road", area: "Kensal Rise", postcode: "NW10 3JU" },
          features: ["independent", "community", "charity", "art-deco"],
        },
        createScraper: () => createLexiScraper(),
      } satisfies SingleVenueConfig;
    },
  },
  {
    id: "garden",
    name: "Garden Cinema",
    type: "independent",
    createConfig: async () => {
      const { createGardenCinemaScraper } = await import("./cinemas/garden");
      return {
        type: "single",
        venue: {
          id: "garden",
          name: "Garden Cinema",
          shortName: "Garden",
          website: "https://thegardencinema.co.uk",
          address: { street: "39-41 Parker Street", area: "Covent Garden", postcode: "WC2B 5PQ" },
          features: ["independent", "art-house", "bar", "luxury"],
        },
        createScraper: () => createGardenCinemaScraper(),
      } satisfies SingleVenueConfig;
    },
  },
  {
    id: "castle",
    name: "Castle Cinema",
    type: "independent",
    createConfig: async () => {
      const { createCastleScraper } = await import("./cinemas/castle");
      return {
        type: "single",
        venue: {
          id: "castle",
          name: "Castle Cinema",
          shortName: "Castle",
          website: "https://thecastlecinema.com",
          address: { street: "64-66 Brooksby's Walk", area: "Hackney", postcode: "E9 6DA" },
          features: ["independent", "community", "cafe-bar"],
        },
        createScraper: () => createCastleScraper(),
      } satisfies SingleVenueConfig;
    },
  },
  {
    id: "phoenix",
    name: "Phoenix Cinema",
    type: "independent",
    createConfig: async () => {
      const { createPhoenixScraper } = await import("./cinemas/phoenix");
      return {
        type: "single",
        venue: {
          id: "phoenix",
          name: "Phoenix Cinema",
          shortName: "Phoenix",
          website: "https://phoenixcinema.co.uk",
          address: { street: "52 High Road", area: "East Finchley", postcode: "N2 9PJ" },
          features: ["independent", "historic", "repertory", "art-deco"],
        },
        createScraper: () => createPhoenixScraper(),
      } satisfies SingleVenueConfig;
    },
  },
  {
    id: "rich-mix",
    name: "Rich Mix",
    type: "independent",
    createConfig: async () => {
      const { createRichMixScraper } = await import("./cinemas/rich-mix");
      return {
        type: "single",
        venue: {
          id: "rich-mix",
          name: "Rich Mix",
          shortName: "Rich Mix",
          website: "https://richmix.org.uk",
          address: { street: "35-47 Bethnal Green Road", area: "Shoreditch", postcode: "E1 6LA" },
          features: ["independent", "arts-centre", "community", "world-cinema"],
        },
        createScraper: () => createRichMixScraper(),
      } satisfies SingleVenueConfig;
    },
  },
];

// ============================================================================
// CLI Commands
// ============================================================================

function printHelp(): void {
  console.log(`
Unified Scraper CLI

Usage:
  npm run scrape <cinema-id>       Run a single cinema scraper
  npm run scrape --all             Run all scrapers
  npm run scrape --list            List available scrapers
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

  const independents = SCRAPERS.filter((s) => s.type === "independent");
  const chains = SCRAPERS.filter((s) => s.type === "chain");

  console.log("Independent Cinemas:");
  independents.forEach((s) => console.log(`  ${s.id.padEnd(20)} ${s.name}`));

  if (chains.length > 0) {
    console.log("\nChain Cinemas:");
    chains.forEach((s) => console.log(`  ${s.id.padEnd(20)} ${s.name}`));
  }

  console.log(`\nTotal: ${SCRAPERS.length} scrapers\n`);
}

async function runSingle(id: string): Promise<void> {
  const scraper = SCRAPERS.find((s) => s.id === id);
  if (!scraper) {
    console.error(`Unknown scraper: ${id}`);
    console.log("Run 'npm run scrape --list' to see available scrapers");
    process.exit(1);
  }

  console.log(`🎬 Running ${scraper.name} scraper...\n`);

  try {
    const config = await scraper.createConfig();
    await runScraper(config, { useValidation: true });
  } catch (error) {
    console.error(`❌ Error running ${scraper.name}:`, error);
    process.exit(1);
  }
}

async function runMultiple(filter?: "independent" | "chain"): Promise<void> {
  const scrapers = filter ? SCRAPERS.filter((s) => s.type === filter) : SCRAPERS;

  console.log(`🎬 Running ${scrapers.length} scrapers...\n`);

  const results: { id: string; success: boolean; screenings: number }[] = [];

  for (const scraper of scrapers) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`▶ ${scraper.name}`);
    console.log("=".repeat(60));

    try {
      const config = await scraper.createConfig();
      const result = await runScraper(config, { useValidation: true });
      results.push({
        id: scraper.id,
        success: result.success,
        screenings: result.totalScreeningsFound,
      });
    } catch (error) {
      console.error(`❌ Error:`, error instanceof Error ? error.message : error);
      results.push({ id: scraper.id, success: false, screenings: 0 });
    }
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const totalScreenings = results.reduce((sum, r) => sum + r.screenings, 0);

  console.log(`✅ Succeeded: ${succeeded.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  console.log(`📽️  Total screenings: ${totalScreenings}`);

  if (failed.length > 0) {
    console.log(`\nFailed scrapers: ${failed.map((r) => r.id).join(", ")}`);
  }
}

// ============================================================================
// Main
// ============================================================================

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

  // Single scraper by ID
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
