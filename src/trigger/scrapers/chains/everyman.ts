import { task } from "@trigger.dev/sdk/v3";
import { type ChainConfig, type VenueDefinition } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { createEverymanScraper } from "@/scrapers/chains/everyman";
import { getActiveCinemasByChain, getCinemasByChain } from "@/config/cinema-registry";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

function buildConfig(): ChainConfig {
  const all = getCinemasByChain("everyman");
  const active = getActiveCinemasByChain("everyman");
  const venues: VenueDefinition[] = all.map((c) => ({
    id: c.id, name: c.name, shortName: c.shortName, website: c.website,
    chain: "Everyman",
    address: { street: c.address.street, area: c.address.area, postcode: c.address.postcode },
    features: c.features,
  }));
  return {
    type: "chain", chainName: "Everyman", venues,
    createScraper: () => createEverymanScraper(),
    getActiveVenueIds: () => active.map((c) => c.id),
  };
}

export const everymanScraper = task({
  id: "scraper-chain-everyman",
  machine: { preset: "medium-1x" },
  maxDuration: 900, // 15 min — ~14 venues via Playwright
  retry: { maxAttempts: 0 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(buildConfig(), { useValidation: true });
  },
});
