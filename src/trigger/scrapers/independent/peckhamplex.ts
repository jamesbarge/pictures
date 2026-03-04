import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createPeckhamplexScraper } from "@/scrapers/cinemas/peckhamplex";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "peckhamplex",
    name: "Peckhamplex",
    shortName: "Plex",
    website: "https://peckhamplex.london",
    address: { street: "95A Rye Lane", area: "Peckham", postcode: "SE15 4ST" },
    features: ["independent","affordable","community"],
  },
  createScraper: () => createPeckhamplexScraper(),
};

export const peckhamplexScraper = task({
  id: "scraper-peckhamplex",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
