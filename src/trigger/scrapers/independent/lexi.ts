import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createLexiScraper } from "@/scrapers/cinemas/lexi";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "lexi",
    name: "The Lexi Cinema",
    shortName: "Lexi",
    website: "https://thelexicinema.co.uk",
    address: { street: "194B Chamberlayne Road", area: "Kensal Rise", postcode: "NW10 3JU" },
    features: ["independent","community","charity","art-deco"],
  },
  createScraper: () => createLexiScraper(),
};

export const lexiScraper = task({
  id: "scraper-lexi",
  machine: { preset: "medium-1x" },
  maxDuration: 600, // 10 min — Playwright scraper
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
