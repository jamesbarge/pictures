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
  maxDuration: 1800, // 30 min — API returns 300+ screenings, pipeline is 4s/screening Gemini pacing
  retry: { maxAttempts: 0 },
  run: async (): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, { useValidation: true });
  },
});
