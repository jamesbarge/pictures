import { task } from "@trigger.dev/sdk/v3";
import { type SingleVenueConfig } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { getVenueFromRegistry } from "../../utils/venue-from-registry";
import { createOlympicScraper } from "@/scrapers/cinemas/olympic";
import type { ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: getVenueFromRegistry("olympic-studios"),
  createScraper: () => createOlympicScraper(),
};

export const olympicScraper = task({
  id: "scraper-olympic",
  maxDuration: 600, // 10 min
  retry: { maxAttempts: 0 },
  run: async (): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, { useValidation: true });
  },
});
