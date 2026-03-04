import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createRiversideScraperV2 } from "@/scrapers/cinemas/riverside-v2";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "riverside-studios",
    name: "Riverside Studios",
    shortName: "Riverside",
    website: "https://riversidestudios.co.uk",
    address: { street: "101 Queen Caroline Street", area: "Hammersmith", postcode: "W6 9BN" },
    features: ["arts-centre","independent","theatre"],
  },
  createScraper: () => createRiversideScraperV2(),
};

export const riversideScraper = task({
  id: "scraper-riverside",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
