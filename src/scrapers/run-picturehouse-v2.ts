#!/usr/bin/env npx tsx
/**
 * Picturehouse Chain Scraper Runner (v2 - using runner-factory)
 *
 * Usage:
 *   npm run scrape:picturehouse              # Scrape all active venues
 *   npm run scrape:picturehouse -- central   # Scrape specific venue
 *   npm run scrape:picturehouse -- central hackney  # Scrape multiple venues
 *
 * This v2 runner uses the runner-factory pattern for:
 * - Consistent logging (JSON in production)
 * - Retry-then-continue error handling
 * - Proper TypeScript types (no @ts-nocheck)
 * - Health checks before scraping
 */

import { createMain, type ChainConfig, type VenueDefinition } from "./runner-factory";
import { createPicturehouseScraper } from "./chains/picturehouse";
import { getActiveCinemasByChain, getCinemasByChain } from "@/config/cinema-registry";

// ============================================================================
// Configuration from Registry
// ============================================================================

const picturehouseCinemas = getCinemasByChain("picturehouse");
const activePicturehouseCinemas = getActiveCinemasByChain("picturehouse");

// Convert registry definitions to VenueDefinitions
const venues: VenueDefinition[] = picturehouseCinemas.map((cinema) => ({
  id: cinema.id,
  name: cinema.name,
  shortName: cinema.shortName,
  website: cinema.website,
  chain: "Picturehouse",
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
  chainName: "Picturehouse",
  venues,
  createScraper: () => createPicturehouseScraper(),
  getActiveVenueIds: () => activePicturehouseCinemas.map((c) => c.id),
};

// ============================================================================
// Main
// ============================================================================

const main = createMain(config, {
  useValidation: true,
  venuePrefix: "picturehouse-",
});

main().catch((error) => {
  console.error("[picturehouse-v2] Fatal error:", error);
  process.exit(1);
});
