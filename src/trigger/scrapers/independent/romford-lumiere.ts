import { task } from "@trigger.dev/sdk/v3";
import { type SingleVenueConfig } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { getVenueFromRegistry } from "../../utils/venue-from-registry";
import { createRomfordLumiereScraper } from "@/scrapers/cinemas/romford-lumiere";
import type { ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: getVenueFromRegistry("romford-lumiere"),
  createScraper: () => createRomfordLumiereScraper(),
};

export const romfordLumiereScraper = task({
  id: "scraper-romford-lumiere",
  retry: { maxAttempts: 3 },
  run: async (): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, { useValidation: true });
  },
});
