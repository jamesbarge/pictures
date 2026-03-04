import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type ChainConfig, type VenueDefinition } from "@/scrapers/runner-factory";
import { createCurzonScraper } from "@/scrapers/chains/curzon";
import { getActiveCinemasByChain, getCinemasByChain } from "@/config/cinema-registry";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

function buildConfig(): ChainConfig {
  const all = getCinemasByChain("curzon");
  const active = getActiveCinemasByChain("curzon");
  const venues: VenueDefinition[] = all.map((c) => ({
    id: c.id, name: c.name, shortName: c.shortName, website: c.website,
    chain: "Curzon",
    address: { street: c.address.street, area: c.address.area, postcode: c.address.postcode },
    features: c.features,
  }));
  return {
    type: "chain", chainName: "Curzon", venues,
    createScraper: () => createCurzonScraper(),
    getActiveVenueIds: () => active.map((c) => c.id),
  };
}

export const curzonScraper = task({
  id: "scraper-chain-curzon",
  machine: { preset: "medium-1x" },
  maxDuration: 900, // 15 min — ~10 venues via Playwright
  retry: { maxAttempts: 0 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(buildConfig(), { useValidation: true });
  },
});
