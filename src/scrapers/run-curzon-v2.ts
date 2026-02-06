#!/usr/bin/env npx tsx
/**
 * Curzon Chain Scraper Runner (v2 - using runner-factory)
 *
 * Usage:
 *   npm run scrape:curzon              # Scrape all active venues
 *   npm run scrape:curzon -- soho      # Scrape specific venue
 *   npm run scrape:curzon -- soho mayfair  # Scrape multiple venues
 *
 * This v2 runner uses the runner-factory pattern for:
 * - Consistent logging (JSON in production)
 * - Retry-then-continue error handling
 * - Proper TypeScript types (no @ts-nocheck)
 * - Health checks before scraping
 */

import { createMain, type ChainConfig, type VenueDefinition } from "./runner-factory";
import { createCurzonScraper } from "./chains/curzon";
import { getActiveCinemasByChain, getCinemasByChain } from "@/config/cinema-registry";

// ============================================================================
// Configuration from Registry
// ============================================================================

const curzonCinemas = getCinemasByChain("curzon");
const activeCurzonCinemas = getActiveCinemasByChain("curzon");

// Convert registry definitions to VenueDefinitions
const venues: VenueDefinition[] = curzonCinemas.map((cinema) => ({
  id: cinema.id,
  name: cinema.name,
  shortName: cinema.shortName,
  website: cinema.website,
  chain: "Curzon",
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
  chainName: "Curzon",
  venues,
  createScraper: () => createCurzonScraper(),
  getActiveVenueIds: () => activeCurzonCinemas.map((c) => c.id),
};

// ============================================================================
// Main
// ============================================================================

const main = createMain(config, {
  useValidation: true,
  venuePrefix: "curzon-",
});

main().catch((error) => {
  console.error("[curzon-v2] Fatal error:", error);
  process.exit(1);
});
