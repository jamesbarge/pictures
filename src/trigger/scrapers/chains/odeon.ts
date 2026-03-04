import { task } from "@trigger.dev/sdk/v3";
import { type ChainConfig, type VenueDefinition } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { createOdeonScraper, getActiveOdeonVenues } from "@/scrapers/chains/odeon";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

function buildConfig(): ChainConfig {
  const active = getActiveOdeonVenues();
  const venues: VenueDefinition[] = active.map((v) => ({
    id: v.id,
    name: v.name,
    shortName: v.shortName,
    website: `https://www.odeon.co.uk/cinemas/${v.slug}/`,
    chain: "Odeon",
    address: { street: v.address ?? "", area: v.area, postcode: v.postcode ?? "" },
    features: v.features,
  }));
  return {
    type: "chain", chainName: "Odeon", venues,
    createScraper: () => createOdeonScraper(),
    getActiveVenueIds: () => active.map((v) => v.id),
  };
}

export const odeonScraper = task({
  id: "scraper-chain-odeon",
  machine: { preset: "medium-1x" },
  maxDuration: 600, // 10 min — API-based, multiple venues
  retry: { maxAttempts: 0 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(buildConfig(), { useValidation: true });
  },
});
