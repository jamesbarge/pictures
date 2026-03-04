import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createRichMixScraper } from "@/scrapers/cinemas/rich-mix";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "rich-mix",
    name: "Rich Mix",
    shortName: "Rich Mix",
    website: "https://richmix.org.uk",
    address: { street: "35-47 Bethnal Green Road", area: "Shoreditch", postcode: "E1 6LA" },
    features: ["independent","arts-centre","community","world-cinema"],
  },
  createScraper: () => createRichMixScraper(),
};

export const richMixScraper = task({
  id: "scraper-rich-mix",
  machine: { preset: "medium-1x" },
  maxDuration: 600, // 10 min — Playwright scraper
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
