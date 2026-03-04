import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createRomfordLumiereScraper } from "@/scrapers/cinemas/romford-lumiere";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "romford-lumiere",
    name: "Lumiere Romford",
    shortName: "Lumiere",
    website: "https://www.lumiereromford.com",
    address: { street: "Mercury Gardens", area: "Romford", postcode: "RM1 3EE" },
    features: ["bar","accessible","community"],
  },
  createScraper: () => createRomfordLumiereScraper(),
};

export const romfordLumiereScraper = task({
  id: "scraper-romford-lumiere",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
