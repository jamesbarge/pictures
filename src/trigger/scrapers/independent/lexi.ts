import { task } from "@trigger.dev/sdk/v3";
import { type SingleVenueConfig } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { getVenueFromRegistry } from "../../utils/venue-from-registry";
import { createLexiScraper } from "@/scrapers/cinemas/lexi";
import type { ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: getVenueFromRegistry("lexi"),
  createScraper: () => createLexiScraper(),
};

export const lexiScraper = task({
  id: "scraper-lexi",
  machine: { preset: "medium-1x" },
  maxDuration: 600, // 10 min — Playwright scraper
  retry: { maxAttempts: 3 },
  run: async (): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, { useValidation: true });
  },
});
