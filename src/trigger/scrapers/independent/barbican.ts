import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createBarbicanScraper } from "@/scrapers/cinemas/barbican";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "barbican",
    name: "Barbican Cinema",
    shortName: "Barbican",
    website: "https://www.barbican.org.uk",
    address: { street: "Silk Street", area: "City of London", postcode: "EC2Y 8DS" },
    features: ["arts-centre","repertory","world-cinema","accessible"],
  },
  createScraper: () => createBarbicanScraper(),
};

export const barbicanScraper = task({
  id: "scraper-barbican",
  machine: { preset: "medium-1x" },
  maxDuration: 600, // 10 min — Playwright scraper
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
