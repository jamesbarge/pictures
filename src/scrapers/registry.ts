/**
 * Scraper Registry — single source of truth for cinema scrapers.
 *
 * Maps each cinema-task-ID (e.g. "scraper-bfi", "scraper-chain-curzon") to a
 * config builder that returns a SingleVenueConfig | MultiVenueConfig | ChainConfig
 * suitable for passing to runScraper() in the runner factory.
 *
 * The registry is grouped into "waves" matching the orchestration order in
 * the daily scrape-all job: chains first, then Playwright independents, then
 * Cheerio-based independents, then enrichment.
 *
 * Adding a new scraper:
 *   1. Implement createXxxScraper() under src/scrapers/cinemas/ or chains/
 *   2. Add an entry below in the appropriate wave
 *   3. The same task ID is used by the (deprecated) trigger wrappers, so keep
 *      naming consistent (e.g. "scraper-foo").
 */

import {
  type SingleVenueConfig,
  type MultiVenueConfig,
  type ChainConfig,
} from "@/scrapers/runner-factory";
import {
  buildChainConfig,
  getVenueFromRegistry,
} from "@/trigger/utils/venue-from-registry";

// Chain factories
import { createCurzonScraper } from "@/scrapers/chains/curzon";
import { createPicturehouseScraper } from "@/scrapers/chains/picturehouse";
import { createEverymanScraper } from "@/scrapers/chains/everyman";

// Independent (Playwright) factories
import { createBFIScraper } from "@/scrapers/cinemas/bfi";
import { createBarbicanScraper } from "@/scrapers/cinemas/barbican";
import { createPhoenixScraper } from "@/scrapers/cinemas/phoenix";
import { createElectricScraperV2 } from "@/scrapers/cinemas/electric-v2";
import { createLexiScraper } from "@/scrapers/cinemas/lexi";
import { createRegentStreetScraper } from "@/scrapers/cinemas/regent-street";
import { createRichMixScraper } from "@/scrapers/cinemas/rich-mix";

// Independent (Cheerio / API) factories
import { createCastleScraper } from "@/scrapers/cinemas/castle";
import { createRioScraper } from "@/scrapers/cinemas/rio";
import { createPrinceCharlesScraper } from "@/scrapers/cinemas/prince-charles";
import { createICAScraper } from "@/scrapers/cinemas/ica";
import { createGenesisScraper } from "@/scrapers/cinemas/genesis";
import { createPeckhamplexScraper } from "@/scrapers/cinemas/peckhamplex";
import { createNickelScraper } from "@/scrapers/cinemas/the-nickel";
import { createGardenCinemaScraper } from "@/scrapers/cinemas/garden";
import { createCloseUpCinemaScraper } from "@/scrapers/cinemas/close-up";
import { createCineLumiereScraper } from "@/scrapers/cinemas/cine-lumiere";
import { createCastleSidcupScraper } from "@/scrapers/cinemas/castle-sidcup";
import { createArtHouseCrouchEndScraper } from "@/scrapers/cinemas/arthouse-crouch-end";
import { createColdharbourBlueScraper } from "@/scrapers/cinemas/coldharbour-blue";
import { createOlympicScraper } from "@/scrapers/cinemas/olympic";
import { createDavidLeanScraper } from "@/scrapers/cinemas/david-lean";
import { createRiversideScraperV2 } from "@/scrapers/cinemas/riverside-v2";

export type ScraperWave = "chain" | "playwright" | "cheerio" | "enrichment";

export interface ScraperRegistryEntry {
  /** Task ID, e.g. "scraper-bfi" or "scraper-chain-curzon". */
  taskId: string;
  /** Config shape — used to dispatch in the runner factory. */
  type: "single" | "multi" | "chain";
  /** Logical wave this scraper runs in (orchestration order). */
  wave: ScraperWave;
  /** Build a fresh config object — kept lazy so unused scrapers stay cheap. */
  buildConfig: () => SingleVenueConfig | MultiVenueConfig | ChainConfig;
}

// ───── Wave 1: Chains ─────
const CHAIN_ENTRIES: ScraperRegistryEntry[] = [
  {
    taskId: "scraper-chain-curzon",
    type: "chain",
    wave: "chain",
    buildConfig: () => buildChainConfig("curzon", "Curzon", () => createCurzonScraper()),
  },
  {
    taskId: "scraper-chain-picturehouse",
    type: "chain",
    wave: "chain",
    buildConfig: () =>
      buildChainConfig("picturehouse", "Picturehouse", () => createPicturehouseScraper()),
  },
  {
    taskId: "scraper-chain-everyman",
    type: "chain",
    wave: "chain",
    buildConfig: () => buildChainConfig("everyman", "Everyman", () => createEverymanScraper()),
  },
];

// ───── Wave 2: Playwright independents ─────
const PLAYWRIGHT_ENTRIES: ScraperRegistryEntry[] = [
  {
    taskId: "scraper-bfi",
    type: "multi",
    wave: "playwright",
    buildConfig: (): MultiVenueConfig => ({
      type: "multi",
      venues: [
        getVenueFromRegistry("bfi-southbank"),
        getVenueFromRegistry("bfi-imax"),
      ],
      createScraper: (venueId: string) =>
        createBFIScraper(venueId as "bfi-southbank" | "bfi-imax"),
    }),
  },
  {
    taskId: "scraper-barbican",
    type: "single",
    wave: "playwright",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("barbican"),
      createScraper: () => createBarbicanScraper(),
    }),
  },
  {
    taskId: "scraper-phoenix",
    type: "single",
    wave: "playwright",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("phoenix-east-finchley"),
      createScraper: () => createPhoenixScraper(),
    }),
  },
  {
    taskId: "scraper-electric",
    type: "multi",
    wave: "playwright",
    buildConfig: (): MultiVenueConfig => ({
      type: "multi",
      venues: [
        getVenueFromRegistry("electric-portobello"),
        getVenueFromRegistry("electric-white-city"),
      ],
      createScraper: (venueId: string) => createElectricScraperV2(venueId),
    }),
  },
  {
    taskId: "scraper-lexi",
    type: "single",
    wave: "playwright",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("lexi"),
      createScraper: () => createLexiScraper(),
    }),
  },
  {
    taskId: "scraper-regent-street",
    type: "single",
    wave: "playwright",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("regent-street"),
      createScraper: () => createRegentStreetScraper(),
    }),
  },
  {
    taskId: "scraper-rich-mix",
    type: "single",
    wave: "playwright",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("rich-mix"),
      createScraper: () => createRichMixScraper(),
    }),
  },
];

// ───── Wave 3: Cheerio / API independents ─────
const CHEERIO_ENTRIES: ScraperRegistryEntry[] = [
  {
    taskId: "scraper-castle",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("castle"),
      createScraper: () => createCastleScraper(),
    }),
  },
  {
    taskId: "scraper-rio",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("rio-dalston"),
      createScraper: () => createRioScraper(),
    }),
  },
  {
    taskId: "scraper-prince-charles",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("prince-charles"),
      createScraper: () => createPrinceCharlesScraper(),
    }),
  },
  {
    taskId: "scraper-ica",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("ica"),
      createScraper: () => createICAScraper(),
    }),
  },
  {
    taskId: "scraper-genesis",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("genesis"),
      createScraper: () => createGenesisScraper(),
    }),
  },
  {
    taskId: "scraper-peckhamplex",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("peckhamplex"),
      createScraper: () => createPeckhamplexScraper(),
    }),
  },
  {
    taskId: "scraper-nickel",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("the-nickel"),
      createScraper: () => createNickelScraper(),
    }),
  },
  {
    taskId: "scraper-garden",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("garden"),
      createScraper: () => createGardenCinemaScraper(),
    }),
  },
  {
    taskId: "scraper-close-up",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("close-up-cinema"),
      createScraper: () => createCloseUpCinemaScraper(),
    }),
  },
  {
    taskId: "scraper-cine-lumiere",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("cine-lumiere"),
      createScraper: () => createCineLumiereScraper(),
    }),
  },
  {
    taskId: "scraper-castle-sidcup",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("castle-sidcup"),
      createScraper: () => createCastleSidcupScraper(),
    }),
  },
  {
    taskId: "scraper-arthouse",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("arthouse-crouch-end"),
      createScraper: () => createArtHouseCrouchEndScraper(),
    }),
  },
  {
    taskId: "scraper-coldharbour-blue",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("coldharbour-blue"),
      createScraper: () => createColdharbourBlueScraper(),
    }),
  },
  {
    taskId: "scraper-olympic",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("olympic-studios"),
      createScraper: () => createOlympicScraper(),
    }),
  },
  {
    taskId: "scraper-david-lean",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("david-lean-cinema"),
      createScraper: () => createDavidLeanScraper(),
    }),
  },
  {
    taskId: "scraper-riverside",
    type: "single",
    wave: "cheerio",
    buildConfig: (): SingleVenueConfig => ({
      type: "single",
      venue: getVenueFromRegistry("riverside-studios"),
      createScraper: () => createRiversideScraperV2(),
    }),
  },
];

// ───── Wave 4: Enrichment (no scraper config — orchestrator dispatches directly) ─────
const ENRICHMENT_ENTRIES: ScraperRegistryEntry[] = [
  {
    taskId: "enrichment-letterboxd",
    type: "single",
    wave: "enrichment",
    // Enrichment isn't a scraper — the orchestrator special-cases this wave and
    // never calls buildConfig(). We throw so accidental fan-out fails loudly
    // instead of silently producing a half-broken config.
    buildConfig: () => {
      throw new Error(
        "enrichment-letterboxd has no scraper config — call enrichLetterboxdRatings directly",
      );
    },
  },
];

export const SCRAPER_REGISTRY: ScraperRegistryEntry[] = [
  ...CHAIN_ENTRIES,
  ...PLAYWRIGHT_ENTRIES,
  ...CHEERIO_ENTRIES,
  ...ENRICHMENT_ENTRIES,
];

/** Look up a registry entry by task ID (returns undefined if not found). */
export function getScraperByTaskId(taskId: string): ScraperRegistryEntry | undefined {
  return SCRAPER_REGISTRY.find((e) => e.taskId === taskId);
}

/** All entries in a given wave, in declared order. */
export function getScrapersByWave(wave: ScraperWave): ScraperRegistryEntry[] {
  return SCRAPER_REGISTRY.filter((e) => e.wave === wave);
}
