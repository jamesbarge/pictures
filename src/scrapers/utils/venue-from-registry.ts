import { getCinemaById, getCinemasByChain, getActiveCinemasByChain, type CinemaDefinition, type ChainId } from "@/config/cinema-registry";
import type { VenueDefinition, ChainConfig } from "@/scrapers/runner-factory";
import type { ChainScraper } from "@/scrapers/types";

/**
 * Convert a CinemaDefinition from the registry into a VenueDefinition
 * used by the scraper runner factory.
 */
export function cinemaToVenue(cinema: CinemaDefinition): VenueDefinition {
  return {
    id: cinema.id,
    name: cinema.name,
    shortName: cinema.shortName,
    website: cinema.website,
    chain: cinema.chain ?? undefined,
    address: {
      street: cinema.address.street,
      area: cinema.address.area,
      postcode: cinema.address.postcode,
    },
    features: cinema.features,
  };
}

/**
 * Build a ChainConfig from the cinema registry for a given chain.
 * Replaces the duplicated buildConfig() functions in chain trigger files.
 */
export function buildChainConfig(
  chainKey: ChainId,
  chainName: string,
  createScraper: () => ChainScraper
): ChainConfig {
  const all = getCinemasByChain(chainKey);
  const active = getActiveCinemasByChain(chainKey);
  return {
    type: "chain",
    chainName,
    venues: all.map(cinemaToVenue),
    createScraper,
    getActiveVenueIds: () => active.map((c) => c.id),
  };
}

/**
 * Look up a cinema by ID in the registry and return a VenueDefinition.
 * Throws if the cinema ID is not found (programming error).
 */
export function getVenueFromRegistry(cinemaId: string): VenueDefinition {
  const cinema = getCinemaById(cinemaId);
  if (!cinema) {
    throw new Error(`Cinema "${cinemaId}" not found in registry`);
  }
  return cinemaToVenue(cinema);
}
