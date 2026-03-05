import { task } from "@trigger.dev/sdk/v3";
import { type ChainConfig, type VenueDefinition } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { createPicturehouseScraper } from "@/scrapers/chains/picturehouse";
import { getActiveCinemasByChain, getCinemasByChain } from "@/config/cinema-registry";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

function buildConfig(): ChainConfig {
  const all = getCinemasByChain("picturehouse");
  const active = getActiveCinemasByChain("picturehouse");
  const venues: VenueDefinition[] = all.map((c) => ({
    id: c.id, name: c.name, shortName: c.shortName, website: c.website,
    chain: "Picturehouse",
    address: { street: c.address.street, area: c.address.area, postcode: c.address.postcode },
    features: c.features,
  }));
  return {
    type: "chain", chainName: "Picturehouse", venues,
    createScraper: () => createPicturehouseScraper(),
    getActiveVenueIds: () => active.map((c) => c.id),
  };
}

export const picturehouseScraper = task({
  id: "scraper-chain-picturehouse",
  machine: { preset: "medium-1x" },
  maxDuration: 1800, // 30 min — ~11 venues via Playwright
  retry: { maxAttempts: 0 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(buildConfig(), { useValidation: true });
  },
});
