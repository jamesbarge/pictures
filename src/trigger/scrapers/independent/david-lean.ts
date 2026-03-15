import { task } from "@trigger.dev/sdk/v3";
import { type SingleVenueConfig } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { getVenueFromRegistry } from "../../utils/venue-from-registry";
import { createDavidLeanScraper } from "@/scrapers/cinemas/david-lean";
import type { ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: getVenueFromRegistry("david-lean-cinema"),
  createScraper: () => createDavidLeanScraper(),
};

export const davidLeanScraper = task({
  id: "scraper-david-lean",
  maxDuration: 600, // 10 min
  retry: { maxAttempts: 0 },
  run: async (): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, { useValidation: true });
  },
});
