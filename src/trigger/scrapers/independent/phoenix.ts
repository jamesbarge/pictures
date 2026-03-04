import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createPhoenixScraper } from "@/scrapers/cinemas/phoenix";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "phoenix-east-finchley",
    name: "Phoenix Cinema",
    shortName: "Phoenix",
    website: "https://phoenixcinema.co.uk",
    address: { street: "52 High Road", area: "East Finchley", postcode: "N2 9PJ" },
    features: ["independent","historic","repertory","art-deco"],
  },
  createScraper: () => createPhoenixScraper(),
};

export const phoenixScraper = task({
  id: "scraper-phoenix",
  machine: { preset: "medium-1x" },
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
