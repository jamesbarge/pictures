import { task } from "@trigger.dev/sdk/v3";
import { type SingleVenueConfig } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { getVenueFromRegistry } from "../../utils/venue-from-registry";
import { createGardenCinemaScraper } from "@/scrapers/cinemas/garden";
import type { ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: getVenueFromRegistry("garden"),
  createScraper: () => createGardenCinemaScraper(),
};

export const gardenScraper = task({
  id: "scraper-garden",
  retry: { maxAttempts: 3 },
  run: async (): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, { useValidation: true });
  },
});
