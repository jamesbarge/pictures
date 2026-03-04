import { task } from "@trigger.dev/sdk/v3";
import { type MultiVenueConfig } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { getVenueFromRegistry } from "../../utils/venue-from-registry";
import { createBFIScraper } from "@/scrapers/cinemas/bfi";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: MultiVenueConfig = {
  type: "multi",
  venues: [
    getVenueFromRegistry("bfi-southbank"),
    getVenueFromRegistry("bfi-imax"),
  ],
  createScraper: (venueId: string) =>
    createBFIScraper(venueId as "bfi-southbank" | "bfi-imax"),
};

export const bfiScraper = task({
  id: "scraper-bfi",
  machine: { preset: "medium-1x" },
  maxDuration: 1800, // 30 min — 2 venues (Southbank + IMAX), Playwright + 90+ AI title extractions
  retry: { maxAttempts: 2 },
  run: async (payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, {
      useValidation: true,
      venueIds: payload.cinemaId ? [payload.cinemaId] : [],
    });
  },
});
