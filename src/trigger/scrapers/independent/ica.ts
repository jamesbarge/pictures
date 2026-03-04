import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createICAScraper } from "@/scrapers/cinemas/ica";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "ica",
    name: "Institute of Contemporary Arts",
    shortName: "ICA",
    website: "https://www.ica.art",
    address: { street: "The Mall", area: "St James's", postcode: "SW1Y 5AH" },
    features: ["independent","repertory","art-house","gallery"],
  },
  createScraper: () => createICAScraper(),
};

export const icaScraper = task({
  id: "scraper-ica",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
