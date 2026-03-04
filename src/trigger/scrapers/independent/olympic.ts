import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createOlympicScraper } from "@/scrapers/cinemas/olympic";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "olympic-studios",
    name: "Olympic Studios",
    shortName: "Olympic",
    website: "https://olympiccinema.co.uk",
    address: { street: "117-123 Church Road", area: "Barnes", postcode: "SW13 9HL" },
    features: ["independent","luxury","bar","restaurant"],
  },
  createScraper: () => createOlympicScraper(),
};

export const olympicScraper = task({
  id: "scraper-olympic",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
