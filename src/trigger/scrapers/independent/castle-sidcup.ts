import { task } from "@trigger.dev/sdk/v3";
import { type SingleVenueConfig } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { getVenueFromRegistry } from "../../utils/venue-from-registry";
import { createCastleSidcupScraper } from "@/scrapers/cinemas/castle-sidcup";
import type { ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: getVenueFromRegistry("castle-sidcup"),
  createScraper: () => createCastleSidcupScraper(),
};

export const castleSidcupScraper = task({
  id: "scraper-castle-sidcup",
  maxDuration: 600, // 10 min
  retry: { maxAttempts: 0 },
  run: async (): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, { useValidation: true });
  },
});
