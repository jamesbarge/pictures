import { task } from "@trigger.dev/sdk/v3";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { buildChainConfig } from "../../utils/venue-from-registry";
import { createCurzonScraper } from "@/scrapers/chains/curzon";
import type { ScraperTaskOutput } from "../../types";

export const curzonScraper = task({
  id: "scraper-chain-curzon",
  machine: { preset: "medium-1x" },
  maxDuration: 1800, // 30 min — ~10 venues via Playwright
  retry: { maxAttempts: 0 },
  run: async (): Promise<ScraperTaskOutput> => {
    const config = buildChainConfig("curzon", "Curzon", () => createCurzonScraper());
    return runScraperAndVerify(config, { useValidation: true });
  },
});
