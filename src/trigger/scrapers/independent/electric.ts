import { task } from "@trigger.dev/sdk/v3";
import { type MultiVenueConfig } from "@/scrapers/runner-factory";
import { runScraperAndVerify } from "../../utils/scraper-wrapper";
import { getVenueFromRegistry } from "../../utils/venue-from-registry";
import { createElectricScraperV2 } from "@/scrapers/cinemas/electric-v2";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: MultiVenueConfig = {
  type: "multi",
  venues: [
    getVenueFromRegistry("electric-portobello"),
    getVenueFromRegistry("electric-white-city"),
  ],
  createScraper: (venueId: string) => createElectricScraperV2(venueId),
};

export const electricScraper = task({
  id: "scraper-electric",
  machine: { preset: "medium-1x" },
  maxDuration: 600, // 10 min — API-based scraper, 2 venues
  retry: { maxAttempts: 0 },
  run: async (payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraperAndVerify(config, {
      useValidation: true,
      venueIds: payload.cinemaId ? [payload.cinemaId] : [],
    });
  },
});
