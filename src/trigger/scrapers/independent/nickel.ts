import { task } from "@trigger.dev/sdk/v3";
import { type SingleVenueConfig } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { getVenueFromRegistry } from "../../utils/venue-from-registry";
import { createNickelScraper } from "@/scrapers/cinemas/the-nickel";
import type { ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: getVenueFromRegistry("the-nickel"),
  createScraper: () => createNickelScraper(),
};

export const nickelScraper = task({
  id: "scraper-nickel",
  maxDuration: 1200, // 20 min — API fetch + pipeline (150+ screenings × 4s Gemini pacing)
  retry: { maxAttempts: 0 },
  run: async (): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, { useValidation: true });
  },
});
