import { task } from "@trigger.dev/sdk/v3";
import { type SingleVenueConfig } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { getVenueFromRegistry } from "../../utils/venue-from-registry";
import { createElectricScraper } from "@/scrapers/cinemas/electric";
import type { ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: getVenueFromRegistry("electric-portobello"),
  createScraper: () => createElectricScraper(),
};

export const electricScraper = task({
  id: "scraper-electric",
  machine: { preset: "medium-1x" },
  maxDuration: 600, // 10 min — Playwright scraper
  retry: { maxAttempts: 3 },
  run: async (): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, { useValidation: true });
  },
});
