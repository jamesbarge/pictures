/**
 * Run Castle Cinema Scraper (v2 — using runner factory)
 *
 * Wires the canonical `createCastleScraper` (the calendar-page parser landed
 * in PR #476) into the standard single-venue runner. Invoked by
 * `npm run scrape:castle`.
 */

import { createMain, type SingleVenueConfig } from "./runner-factory";
import { createCastleScraper } from "./cinemas/castle";

const config: SingleVenueConfig = {
  type: "single",
  venue: {
    id: "castle",
    name: "The Castle Cinema",
    shortName: "Castle",
    website: "https://thecastlecinema.com",
    address: {
      street: "First floor, 64-66 Brooksby's Walk",
      area: "Hackney",
      postcode: "E9 6DA",
    },
    features: ["independent", "community", "arthouse", "bar", "restaurant"],
  },
  createScraper: () => createCastleScraper(),
};

const main = createMain(config, { useValidation: true });
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
