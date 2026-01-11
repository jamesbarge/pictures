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

  /** Unique identifier for deduplication */
  sourceId?: string;
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

  /** URL to the film's page on the cinema website */
  filmUrl?: string;
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

  /** Rate limiting - requests per minute */
  requestsPerMinute: number;

  /** Delay between requests in milliseconds */
  delayBetweenRequests: number;
}

/**
 * Result of a season scrape operation
 */
export interface SeasonScraperResult {
  /** Cinema ID that was scraped */
  cinemaId: string;

  /** Seasons extracted */
  seasons: RawSeason[];

  /** When the scrape was performed */
  scrapedAt: Date;

  /** Whether the scrape succeeded */
  success: boolean;

  /** Error message if the scrape failed */
  error?: string;
}

/**
 * Interface for season scrapers
 */
export interface SeasonScraper {
  config: SeasonScraperConfig;

  /** Scrape all seasons from the cinema */
  scrape(): Promise<RawSeason[]>;

  /** Health check - verify the seasons page is accessible */
  healthCheck(): Promise<boolean>;
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

  /** Slugs of seasons that were processed */
  seasonSlugs: string[];
}
