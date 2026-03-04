import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createRegentStreetScraper } from "@/scrapers/cinemas/regent-street";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "regent-street",
    name: "Regent Street Cinema",
    shortName: "Regent St",
    website: "https://regentstreetcinema.com",
    address: { street: "309 Regent Street", area: "Marylebone", postcode: "W1B 2UW" },
    features: ["independent","historic","repertory"],
  },
  createScraper: () => createRegentStreetScraper(),
};

export const regentStreetScraper = task({
  id: "scraper-regent-street",
  machine: { preset: "medium-1x" },
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
