import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createGenesisScraper } from "@/scrapers/cinemas/genesis";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "genesis",
    name: "Genesis Cinema",
    shortName: "Genesis",
    website: "https://genesiscinema.co.uk",
    address: { street: "93-95 Mile End Road", area: "Mile End", postcode: "E1 4UJ" },
    features: ["independent","affordable","5-screens"],
  },
  createScraper: () => createGenesisScraper(),
};

export const genesisScraper = task({
  id: "scraper-genesis",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
