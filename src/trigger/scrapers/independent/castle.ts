import { task } from "@trigger.dev/sdk/v3";
import { type SingleVenueConfig } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { getVenueFromRegistry } from "../../utils/venue-from-registry";
import { createCastleScraper } from "@/scrapers/cinemas/castle";
import type { ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: getVenueFromRegistry("castle"),
  createScraper: () => createCastleScraper(),
};

export const castleScraper = task({
  id: "scraper-castle",
  maxDuration: 600, // 10 min
  retry: { maxAttempts: 0 },
  run: async (): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, { useValidation: true });
  },
});
