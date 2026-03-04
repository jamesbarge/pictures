import { task } from "@trigger.dev/sdk/v3";
import { type SingleVenueConfig } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { getVenueFromRegistry } from "../../utils/venue-from-registry";
import { createICAScraper } from "@/scrapers/cinemas/ica";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: getVenueFromRegistry("ica"),
  createScraper: () => createICAScraper(),
};

export const icaScraper = task({
  id: "scraper-ica",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, { useValidation: true });
  },
});
