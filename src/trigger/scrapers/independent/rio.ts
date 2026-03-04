import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createRioScraper } from "@/scrapers/cinemas/rio";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "rio-dalston",
    name: "Rio Cinema",
    shortName: "Rio",
    website: "https://riocinema.org.uk",
    address: { street: "107 Kingsland High Street", area: "Dalston", postcode: "E8 2PB" },
    features: ["independent","repertory","bar","35mm","art-deco"],
  },
  createScraper: () => createRioScraper(),
};

export const rioScraper = task({
  id: "scraper-rio",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
