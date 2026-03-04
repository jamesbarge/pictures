import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createCastleSidcupScraper } from "@/scrapers/cinemas/castle-sidcup";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "castle-sidcup",
    name: "Castle Sidcup",
    shortName: "Castle Sidcup",
    website: "https://thecastlecinema.com/sidcup",
    address: { street: "44 Main Road", area: "Sidcup", postcode: "DA14 6NJ" },
    features: ["independent","community"],
  },
  createScraper: () => createCastleSidcupScraper(),
};

export const castleSidcupScraper = task({
  id: "scraper-castle-sidcup",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
