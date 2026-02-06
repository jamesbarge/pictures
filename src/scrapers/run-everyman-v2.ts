#!/usr/bin/env npx tsx
/**
 * Everyman Chain Scraper Runner (v2 - using runner-factory)
 *
 * Usage:
 *   npm run scrape:everyman              # Scrape all active venues
 *   npm run scrape:everyman -- baker-street   # Scrape specific venue
 *   npm run scrape:everyman -- baker-street hampstead  # Scrape multiple venues
 *
 * This v2 runner uses the runner-factory pattern for:
 * - Consistent logging (JSON in production)
 * - Retry-then-continue error handling
 * - Proper TypeScript types (no @ts-nocheck)
 * - Health checks before scraping
 */

import { createMain, type ChainConfig, type VenueDefinition } from "./runner-factory";
import { createEverymanScraper } from "./chains/everyman";
import { getActiveCinemasByChain, getCinemasByChain } from "@/config/cinema-registry";

// ============================================================================
// Configuration from Registry
// ============================================================================

const everymanCinemas = getCinemasByChain("everyman");
const activeEverymanCinemas = getActiveCinemasByChain("everyman");

// Convert registry definitions to VenueDefinitions
const venues: VenueDefinition[] = everymanCinemas.map((cinema) => ({
  id: cinema.id,
  name: cinema.name,
  shortName: cinema.shortName,
  website: cinema.website,
  chain: "Everyman",
  address: {
    street: cinema.address.street,
    area: cinema.address.area,
    postcode: cinema.address.postcode,
  },
  features: cinema.features,
}));

// ============================================================================
// Chain Config
// ============================================================================

const config: ChainConfig = {
  type: "chain",
  chainName: "Everyman",
  venues,
  createScraper: () => createEverymanScraper(),
  getActiveVenueIds: () => activeEverymanCinemas.map((c) => c.id),
};

// ============================================================================
// Main
// ============================================================================

const main = createMain(config, {
  useValidation: true,
  venuePrefix: "everyman-",
});

main().catch((error) => {
  console.error("[everyman-v2] Fatal error:", error);
  process.exit(1);
});
