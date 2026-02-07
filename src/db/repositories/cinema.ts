/**
 * Cinema Repository
 * Encapsulates cinema queries for list and detail endpoints
 */

import { db } from "@/db";
import { cinemas, screenings, films } from "@/db/schema";
import { eq, gte, and, inArray } from "drizzle-orm";
import type { ScreeningFormat } from "@/types/screening";
import type { ContentType } from "@/types/film";

export interface CinemaListItem {
  id: string;
  name: string;
  shortName: string | null;
  chain: string | null;
  address: unknown;
  coordinates: unknown;
  screens: number | null;
  features: string[];
  programmingFocus: string[];
  website: string;
  bookingUrl: string | null;
  imageUrl: string | null;
}

export interface CinemaDetail extends CinemaListItem {
  description: string | null;
}

export interface CinemaScreening {
  id: string;
  datetime: Date;
  format: ScreeningFormat | null;
  screen: string | null;
  eventType: string | null;
  eventDescription: string | null;
  bookingUrl: string;
  isFestivalScreening: boolean;
  availabilityStatus: string | null;
  hasSubtitles: boolean;
  hasAudioDescription: boolean;
  isRelaxedScreening: boolean;
  film: {
    id: string;
    title: string;
    year: number | null;
    posterUrl: string | null;
    runtime: number | null;
    directors: string[];
    isRepertory: boolean;
    letterboxdRating: number | null;
    contentType: ContentType;
  };
}

export interface CinemaListFilters {
  chain?: string;
  features?: string[];
}

/**
 * Get all active cinemas, optionally filtered
 */
export async function getActiveCinemas(
  filters?: CinemaListFilters
): Promise<CinemaListItem[]> {
  const results = await db
    .select({
      id: cinemas.id,
      name: cinemas.name,
      shortName: cinemas.shortName,
      chain: cinemas.chain,
      address: cinemas.address,
      coordinates: cinemas.coordinates,
      screens: cinemas.screens,
      features: cinemas.features,
      programmingFocus: cinemas.programmingFocus,
      website: cinemas.website,
      bookingUrl: cinemas.bookingUrl,
      imageUrl: cinemas.imageUrl,
    })
    .from(cinemas)
    .where(eq(cinemas.isActive, true))
    .orderBy(cinemas.name);

  // Apply post-query filters (arrays don't have clean SQL overlap operators in Drizzle)
  let filtered = results;

  if (filters?.chain) {
    filtered = filtered.filter((c) => c.chain === filters.chain);
  }

  if (filters?.features && filters.features.length > 0) {
    filtered = filtered.filter((c) =>
      filters.features!.some((f) => c.features.includes(f))
    );
  }

  return filtered;
}

/**
 * Get a cinema by ID with description
 */
export async function getCinemaById(id: string): Promise<CinemaDetail | null> {
  const [cinema] = await db
    .select({
      id: cinemas.id,
      name: cinemas.name,
      shortName: cinemas.shortName,
      chain: cinemas.chain,
      address: cinemas.address,
      coordinates: cinemas.coordinates,
      screens: cinemas.screens,
      features: cinemas.features,
      programmingFocus: cinemas.programmingFocus,
      website: cinemas.website,
      bookingUrl: cinemas.bookingUrl,
      imageUrl: cinemas.imageUrl,
      description: cinemas.description,
    })
    .from(cinemas)
    .where(eq(cinemas.id, id))
    .limit(1);

  return cinema ?? null;
}

/**
 * Get upcoming screenings for a cinema with film details
 */
export async function getUpcomingScreeningsForCinema(
  cinemaId: string,
  limit = 100
): Promise<CinemaScreening[]> {
  const now = new Date();

  return db
    .select({
      id: screenings.id,
      datetime: screenings.datetime,
      format: screenings.format,
      screen: screenings.screen,
      eventType: screenings.eventType,
      eventDescription: screenings.eventDescription,
      bookingUrl: screenings.bookingUrl,
      isFestivalScreening: screenings.isFestivalScreening,
      availabilityStatus: screenings.availabilityStatus,
      hasSubtitles: screenings.hasSubtitles,
      hasAudioDescription: screenings.hasAudioDescription,
      isRelaxedScreening: screenings.isRelaxedScreening,
      film: {
        id: films.id,
        title: films.title,
        year: films.year,
        posterUrl: films.posterUrl,
        runtime: films.runtime,
        directors: films.directors,
        isRepertory: films.isRepertory,
        letterboxdRating: films.letterboxdRating,
        contentType: films.contentType,
      },
    })
    .from(screenings)
    .innerJoin(films, eq(screenings.filmId, films.id))
    .where(
      and(eq(screenings.cinemaId, cinemaId), gte(screenings.datetime, now))
    )
    .orderBy(screenings.datetime)
    .limit(limit);
}
