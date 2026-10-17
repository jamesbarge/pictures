/**
 * Season Scraper Types
 * Types for scrapers that extract director seasons and retrospectives from cinema websites
 */

/**
 * Raw season data extracted from a cinema website
 * Similar to RawScreening but for season/retrospective collections
 */
export interface RawSeason {
  /** Season name (e.g., "Kurosawa: Master of Cinema") */
  name: string;

  /** Director name if this is a director-focused season */
  directorName?: string;

  /** Season description/synopsis */
  description?: string;

  /** Start date of the season */
  startDate?: Date;

  /** End date of the season */
  endDate?: Date;

  /** URL to the season's poster image */
  posterUrl?: string;

  /** URL to the season page on the cinema website */
  websiteUrl: string;

  /** Source cinema ID (e.g., "bfi-southbank") */
  sourceCinema: string;

  /** Film titles included in this season */
  films: RawSeasonFilm[];
}

/**
 * A film within a season
 */
export interface RawSeasonFilm {
  /** Film title as displayed on the season page */
  title: string;

  /** Director name if available */
  director?: string;

  /** Release year if available */
  year?: number;

  /** Order within the season (for curated ordering) */
  orderIndex?: number;
}

/**
 * Configuration for season scrapers
 */
export interface SeasonScraperConfig {
  /** Cinema ID (e.g., "bfi-southbank") */
  cinemaId: string;

  /** Base URL of the cinema website */
  baseUrl: string;

  /** URL or path to the seasons listing page */
  seasonsPath: string;

  /** Delay between requests in milliseconds */
  delayBetweenRequests: number;
}

/**
 * Result of saving seasons to the database
 */
export interface SeasonSaveResult {
  /** Number of new seasons created */
  created: number;

  /** Number of existing seasons updated */
  updated: number;

  /** Number of film associations created */
  filmsLinked: number;

  /** Number of films that couldn't be matched */
  filmsUnmatched: number;
}
