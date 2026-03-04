import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createGardenCinemaScraper } from "@/scrapers/cinemas/garden";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "garden",
    name: "Garden Cinema",
    shortName: "Garden",
    website: "https://thegardencinema.co.uk",
    address: { street: "39-41 Parker Street", area: "Covent Garden", postcode: "WC2B 5PQ" },
    features: ["independent","art-house","bar","luxury"],
  },
  createScraper: () => createGardenCinemaScraper(),
};

export const gardenScraper = task({
  id: "scraper-garden",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
