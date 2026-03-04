import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createElectricScraper } from "@/scrapers/cinemas/electric";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "electric-portobello",
    name: "Electric Cinema Portobello",
    shortName: "Electric",
    website: "https://www.electriccinema.co.uk",
    address: { street: "191 Portobello Road", area: "Notting Hill", postcode: "W11 2ED" },
    features: ["independent","luxury","historic","bar"],
  },
  createScraper: () => createElectricScraper(),
};

export const electricScraper = task({
  id: "scraper-electric",
  machine: { preset: "medium-1x" },
  maxDuration: 600, // 10 min — Playwright scraper
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
