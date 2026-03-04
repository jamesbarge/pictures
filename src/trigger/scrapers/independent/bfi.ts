import { task } from "@trigger.dev/sdk/v3";
import { runScraper, type MultiVenueConfig } from "@/scrapers/runner-factory";
import { createBFIScraper } from "@/scrapers/cinemas/bfi";
import type { ScraperTaskPayload, ScraperTaskOutput } from "../../types";

const BFI_VENUES = [
  {
    id: "bfi-southbank",
    name: "BFI Southbank",
    shortName: "BFI",
    website: "https://whatson.bfi.org.uk/Online",
    address: { street: "Belvedere Road", area: "South Bank", postcode: "SE1 8XT" },
    features: ["repertory", "35mm", "70mm", "bar", "cafe", "archive"],
  },
  {
    id: "bfi-imax",
    name: "BFI IMAX",
    shortName: "IMAX",
    website: "https://whatson.bfi.org.uk/imax/Online",
    address: { street: "1 Charlie Chaplin Walk", area: "Waterloo", postcode: "SE1 8XR" },
    features: ["imax", "3d", "dolby-atmos"],
  },
];

const config: MultiVenueConfig = {
  type: "multi",
  venues: BFI_VENUES,
  createScraper: (venueId: string) =>
    createBFIScraper(venueId as "bfi-southbank" | "bfi-imax"),
};

export const bfiScraper = task({
  id: "scraper-bfi",
  machine: { preset: "medium-1x" },
  maxDuration: 1800, // 30 min — 2 venues (Southbank + IMAX), Playwright + 90+ AI title extractions
  retry: { maxAttempts: 2 },
  run: async (payload: ScraperTaskPayload): Promise<ScraperTaskOutput> => {
    return runScraper(config, {
      useValidation: true,
      venueIds: payload.cinemaId ? [payload.cinemaId] : [],
    });
  },
});
