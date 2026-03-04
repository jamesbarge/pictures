import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createPrinceCharlesScraper } from "@/scrapers/cinemas/prince-charles";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "prince-charles",
    name: "Prince Charles Cinema",
    shortName: "PCC",
    website: "https://princecharlescinema.com",
    address: { street: "7 Leicester Place", area: "Leicester Square", postcode: "WC2H 7BY" },
    features: ["independent","repertory","sing-along","marathons","35mm","70mm"],
  },
  createScraper: () => createPrinceCharlesScraper(),
};

export const princeCharlesScraper = task({
  id: "scraper-prince-charles",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
