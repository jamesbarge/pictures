import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createColdharbourBlueScraper } from "@/scrapers/cinemas/coldharbour-blue";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "coldharbour-blue",
    name: "Coldharbour Blue",
    shortName: "Coldharbour",
    website: "https://www.coldharbourblue.com",
    address: { street: "259-260 Hardess Street", area: "Loughborough Junction", postcode: "SE24 0HN" },
    features: ["independent","community","bar"],
  },
  createScraper: () => createColdharbourBlueScraper(),
};

export const coldharbourBlueScraper = task({
  id: "scraper-coldharbour-blue",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
