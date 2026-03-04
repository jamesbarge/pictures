import { getCinemaById, type CinemaDefinition } from "@/config/cinema-registry";
import type { VenueDefinition } from "@/scrapers/runner-factory";

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
