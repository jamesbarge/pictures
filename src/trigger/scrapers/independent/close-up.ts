import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createCloseUpCinemaScraper } from "@/scrapers/cinemas/close-up";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "close-up-cinema",
    name: "Close-Up Cinema",
    shortName: "Close-Up",
    website: "https://www.closeupfilmcentre.com",
    address: { street: "97 Sclater Street", area: "Shoreditch", postcode: "E1 6HR" },
    features: ["independent","repertory","filmmaker-seasons"],
  },
  createScraper: () => createCloseUpCinemaScraper(),
};

export const closeUpScraper = task({
  id: "scraper-close-up",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
