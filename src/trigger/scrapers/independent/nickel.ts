import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createNickelScraper } from "@/scrapers/cinemas/the-nickel";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "the-nickel",
    name: "The Nickel",
    shortName: "Nickel",
    website: "https://thenickel.co.uk",
    address: { street: "194 Upper Street", area: "Islington", postcode: "N1 1RQ" },
    features: ["independent","bar","restaurant"],
  },
  createScraper: () => createNickelScraper(),
};

export const nickelScraper = task({
  id: "scraper-nickel",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
