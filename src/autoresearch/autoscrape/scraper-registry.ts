/**
 * Scraper Factory Registry for AutoScrape
 *
 * Builds a ScraperFactory[] from the canonical cinema registry.
 * Each factory lazily imports the scraper module and creates a SingleVenueConfig
 * for dry-run yield testing.
 *
 * Currently covers independent (non-chain) cinemas only.
 * Chain venues (Curzon, Picturehouse, Everyman) use a different scraping
 * architecture and need separate handling.
 */

import {
  CINEMA_REGISTRY,
  type CinemaDefinition,
} from "@/config/cinema-registry";
import type { SingleVenueConfig } from "@/scrapers/runner-factory";

interface ScraperFactory {
  cinemaId: string;
  createConfig: () => Promise<SingleVenueConfig>;
}

/**
 * Get all AutoScrape-eligible scraper factories.
 * Returns factories for active independent cinemas that use BaseScraper.
 */
export function getScraperFactories(): ScraperFactory[] {
  return CINEMA_REGISTRY
    .filter((c) => c.active && c.chain === null)
    .map((cinema) => ({
      cinemaId: cinema.id,
      createConfig: () => buildSingleVenueConfig(cinema),
    }));
}

/**
 * Get a single scraper factory by cinema ID.
 */
export function getScraperFactory(cinemaId: string): ScraperFactory | undefined {
  const cinema = CINEMA_REGISTRY.find((c) => c.id === cinemaId && c.active);
  if (!cinema) return undefined;

  return {
    cinemaId: cinema.id,
    createConfig: () => buildSingleVenueConfig(cinema),
  };
}

/**
 * Dynamically import a scraper module and build a SingleVenueConfig.
 * Uses the scraperModule and scraperFactory fields from the cinema registry.
 */
async function buildSingleVenueConfig(
  cinema: CinemaDefinition
): Promise<SingleVenueConfig> {
  // Dynamic import of the scraper module
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: Record<string, any> = await import(
    `@/scrapers/${cinema.scraperModule}`
  );

  const factoryFn = mod[cinema.scraperFactory];
  if (typeof factoryFn !== "function") {
    // Some scrapers export a class instead of a factory function
    // Try to use it as a constructor
    if (typeof mod[cinema.scraperFactory] === "function") {
      return {
        type: "single",
        venue: {
          id: cinema.id,
          name: cinema.name,
          shortName: cinema.shortName,
          website: cinema.website,
          address: {
            street: cinema.address.street,
            area: cinema.address.area,
            postcode: cinema.address.postcode,
          },
          features: cinema.features,
        },
        createScraper: () => new mod[cinema.scraperFactory](),
      };
    }
    throw new Error(
      `Scraper factory "${cinema.scraperFactory}" not found in module "${cinema.scraperModule}"`
    );
  }

  return {
    type: "single",
    venue: {
      id: cinema.id,
      name: cinema.name,
      shortName: cinema.shortName,
      website: cinema.website,
      address: {
        street: cinema.address.street,
        area: cinema.address.area,
        postcode: cinema.address.postcode,
      },
      features: cinema.features,
    },
    createScraper: () => factoryFn(),
  };
}
