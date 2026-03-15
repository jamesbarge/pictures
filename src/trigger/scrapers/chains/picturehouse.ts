import { task } from "@trigger.dev/sdk/v3";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { buildChainConfig } from "../../utils/venue-from-registry";
import { createPicturehouseScraper } from "@/scrapers/chains/picturehouse";
import type { ScraperTaskOutput } from "../../types";

export const picturehouseScraper = task({
  id: "scraper-chain-picturehouse",
  machine: { preset: "medium-1x" },
  maxDuration: 3600, // 60 min — 11 venues, 2600+ screenings, pipeline is sequential
  retry: { maxAttempts: 0 },
  run: async (): Promise<ScraperTaskOutput> => {
    const config = buildChainConfig("picturehouse", "Picturehouse", () => createPicturehouseScraper());
    return runScraperAndVerify(config, { useValidation: true });
  },
});
