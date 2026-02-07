/**
 * Film Repository
 * Encapsulates film queries with screening and cinema joins
 */

import { db } from "@/db";
import { films, screenings, cinemas } from "@/db/schema";
import { eq, gte, and } from "drizzle-orm";
import type { ContentType } from "@/types/film";
import type { ScreeningFormat } from "@/types/screening";

export interface FilmDetail {
  id: string;
  tmdbId: number | null;
  imdbId: string | null;
  title: string;
  originalTitle: string | null;
  year: number | null;
  runtime: number | null;
  contentType: ContentType;
  directors: string[];
  cast: unknown[];
  genres: string[];
  countries: string[];
  languages: string[];
  certification: string | null;
  synopsis: string | null;
  tagline: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  sourceImageUrl: string | null;
  trailerUrl: string | null;
  isRepertory: boolean;
  decade: string | null;
  tmdbRating: number | null;
  letterboxdRating: number | null;
  letterboxdUrl: string | null;
}

export interface FilmScreening {
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
  cinema: {
    id: string;
    name: string;
    shortName: string | null;
    address: unknown;
  };
}

/**
 * Get a film by ID with full metadata
 */
export async function getFilmById(id: string): Promise<FilmDetail | null> {
  const [film] = await db
    .select({
      id: films.id,
      tmdbId: films.tmdbId,
      imdbId: films.imdbId,
      title: films.title,
      originalTitle: films.originalTitle,
      year: films.year,
      runtime: films.runtime,
      contentType: films.contentType,
      directors: films.directors,
      cast: films.cast,
      genres: films.genres,
      countries: films.countries,
      languages: films.languages,
      certification: films.certification,
      synopsis: films.synopsis,
      tagline: films.tagline,
      posterUrl: films.posterUrl,
      backdropUrl: films.backdropUrl,
      sourceImageUrl: films.sourceImageUrl,
      trailerUrl: films.trailerUrl,
      isRepertory: films.isRepertory,
      decade: films.decade,
      tmdbRating: films.tmdbRating,
      letterboxdRating: films.letterboxdRating,
      letterboxdUrl: films.letterboxdUrl,
    })
    .from(films)
    .where(eq(films.id, id))
    .limit(1);

  return film ?? null;
}

/**
 * Get upcoming screenings for a film with cinema details
 */
export async function getUpcomingScreeningsForFilm(
  filmId: string,
  limit = 100
): Promise<FilmScreening[]> {
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
      cinema: {
        id: cinemas.id,
        name: cinemas.name,
        shortName: cinemas.shortName,
        address: cinemas.address,
      },
    })
    .from(screenings)
    .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
    .where(and(eq(screenings.filmId, filmId), gte(screenings.datetime, now)))
    .orderBy(screenings.datetime)
    .limit(limit);
}
