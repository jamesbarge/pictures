import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createDavidLeanScraper } from "@/scrapers/cinemas/david-lean";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "david-lean-cinema",
    name: "The David Lean Cinema",
    shortName: "David Lean",
    website: "https://www.davidleancinema.org.uk",
    address: { street: "Croydon Clocktower", area: "Croydon", postcode: "CR9 1ET" },
    features: ["independent","community","repertory"],
  },
  createScraper: () => createDavidLeanScraper(),
};

export const davidLeanScraper = task({
  id: "scraper-david-lean",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
