import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type SingleVenueConfig } from "@/scrapers/runner-factory";
import { createArtHouseCrouchEndScraper } from "@/scrapers/cinemas/arthouse-crouch-end";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "arthouse-crouch-end",
    name: "ArtHouse Crouch End",
    shortName: "ArtHouse",
    website: "https://arthousecrouchend.co.uk",
    address: { street: "159a Tottenham Lane", area: "Crouch End", postcode: "N8 9BT" },
    features: ["independent","community","single-screen"],
  },
  createScraper: () => createArtHouseCrouchEndScraper(),
};

export const arthouseScraper = task({
  id: "scraper-arthouse",
  retry: { maxAttempts: 3 },
  run: async (_payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, { useValidation: true });
  },
});
