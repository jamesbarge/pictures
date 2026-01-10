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
