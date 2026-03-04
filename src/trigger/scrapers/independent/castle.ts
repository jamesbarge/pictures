import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createCastleScraper } from "@/scrapers/cinemas/castle";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "castle",
    name: "Castle Cinema",
    shortName: "Castle",
    website: "https://thecastlecinema.com",
    address: { street: "64-66 Brooksby's Walk", area: "Hackney", postcode: "E9 6DA" },
    features: ["independent", "community", "cafe-bar"],
  },
  createScraper: () => createCastleScraper(),
};

export const castleScraper = task({
  id: "scraper-castle",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
