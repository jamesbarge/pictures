import { task } from "@trigger.dev/sdk/v3";
import { type SingleVenueConfig } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { getVenueFromRegistry } from "../../utils/venue-from-registry";
import { createArtHouseCrouchEndScraper } from "@/scrapers/cinemas/arthouse-crouch-end";
import type { ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: getVenueFromRegistry("arthouse-crouch-end"),
  createScraper: () => createArtHouseCrouchEndScraper(),
};

export const arthouseScraper = task({
  id: "scraper-arthouse",
  maxDuration: 600, // 10 min
  retry: { maxAttempts: 0 },
  run: async (): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, { useValidation: true });
  },
});
