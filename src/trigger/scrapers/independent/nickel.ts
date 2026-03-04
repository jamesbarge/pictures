import { task } from "@trigger.dev/sdk/v3";
import { type SingleVenueConfig } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { getVenueFromRegistry } from "../../utils/venue-from-registry";
import { createNickelScraper } from "@/scrapers/cinemas/the-nickel";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: getVenueFromRegistry("the-nickel"),
  createScraper: () => createNickelScraper(),
};

export const nickelScraper = task({
  id: "scraper-nickel",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, { useValidation: true });
  },
});
