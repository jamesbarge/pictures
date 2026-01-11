/**
 * Season Scrapers Module
 *
 * Exports types, base classes, and utilities for scraping director seasons
 * and retrospectives from cinema websites.
 */

// Types
export type {
  RawSeason,
  RawSeasonFilm,
  SeasonScraperConfig,
  SeasonScraperResult,
  SeasonScraper,
  SeasonSaveResult,
} from "./types";

// Base class
export { BaseSeasonScraper } from "./base";

// Pipeline
export { processSeasons, mergeSeasonSources } from "./pipeline";

// Scrapers
export { BFISeasonScraper, createBFISeasonScraper } from "./bfi";
export { CloseUpSeasonScraper, createCloseUpSeasonScraper } from "./close-up";
export { BarbicanSeasonScraper, createBarbicanSeasonScraper } from "./barbican";
export { PCCSeasonScraper, createPCCSeasonScraper } from "./pcc";
export { ICASeasonScraper, createICASeasonScraper } from "./ica";
