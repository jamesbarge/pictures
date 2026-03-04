import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createCineLumiereScraper } from "@/scrapers/cinemas/cine-lumiere";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "cine-lumiere",
    name: "Cine Lumiere",
    shortName: "Cine Lumiere",
    website: "https://www.institut-francais.org.uk/cine-lumiere/",
    address: { street: "17 Queensberry Place", area: "South Kensington", postcode: "SW7 2DT" },
    features: ["independent","french-cinema","world-cinema"],
  },
  createScraper: () => createCineLumiereScraper(),
};

export const cineLumiereScraper = task({
  id: "scraper-cine-lumiere",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
