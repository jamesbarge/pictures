import { task } from "@trigger.dev/sdk/v3";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { buildChainConfig } from "../../utils/venue-from-registry";
import { createEverymanScraper } from "@/scrapers/chains/everyman";
import type { ScraperTaskOutput } from "../../types";

export const everymanScraper = task({
  id: "scraper-chain-everyman",
  machine: { preset: "medium-1x" },
  maxDuration: 1800, // 30 min — ~14 venues via Playwright
  retry: { maxAttempts: 0 },
  run: async (): Promise<ScraperTaskOutput> => {
    const config = buildChainConfig("everyman", "Everyman", () => createEverymanScraper());
    return runScraperAndVerify(config, { useValidation: true });
  },
});
