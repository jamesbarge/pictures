import { task } from "@trigger.dev/sdk/v3";
import { type SingleVenueConfig } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { getVenueFromRegistry } from "../../utils/venue-from-registry";
import { createGenesisScraper } from "@/scrapers/cinemas/genesis";
import type { ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: getVenueFromRegistry("genesis"),
  createScraper: () => createGenesisScraper(),
};

export const genesisScraper = task({
  id: "scraper-genesis",
  retry: { maxAttempts: 3 },
  run: async (): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, { useValidation: true });
  },
});
