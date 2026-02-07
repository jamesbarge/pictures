/**
 * Screening Repository
 * Encapsulates common screening queries with film and cinema joins
 */

import { db } from "@/db";
import {
  screenings,
  films,
  cinemas,
  festivalScreenings,
  festivals,
  seasons,
  seasonFilms,
} from "@/db/schema";
import { eq, gte, lte, and, inArray, sql, SQL } from "drizzle-orm";
import type { ScreeningFormat } from "@/types/screening";

/**
 * Standard screening select with film and cinema data
 * Used across multiple API routes for consistent field selection
 */
export const screeningWithDetailsSelect = {
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
    directors: films.directors,
    posterUrl: films.posterUrl,
    runtime: films.runtime,
    isRepertory: films.isRepertory,
    letterboxdRating: films.letterboxdRating,
    contentType: films.contentType,
    tmdbRating: films.tmdbRating,
  },
  cinema: {
    id: cinemas.id,
    name: cinemas.name,
    shortName: cinemas.shortName,
  },
} as const;

/**
 * Festival screening select (includes festival-specific metadata)
 */
export const festivalScreeningSelect = {
  ...screeningWithDetailsSelect,
  festivalSection: festivalScreenings.festivalSection,
  isPremiere: festivalScreenings.isPremiere,
  premiereType: festivalScreenings.premiereType,
} as const;

export type ScreeningWithDetails = {
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
    directors: string[];
    posterUrl: string | null;
    runtime: number | null;
    isRepertory: boolean;
    letterboxdRating: number | null;
    contentType: string;
    tmdbRating: number | null;
  };
  cinema: {
    id: string;
    name: string;
    shortName: string | null;
  };
};

export type FestivalScreeningDetails = ScreeningWithDetails & {
  festivalSection: string | null;
  isPremiere: boolean;
  premiereType: string | null;
};

export interface ScreeningFilters {
  startDate: Date;
  endDate: Date;
  cinemaIds?: string[];
  formats?: ScreeningFormat[];
  isRepertory?: boolean;
  festivalOnly?: boolean;
  filmIds?: string[];
}

/**
 * Build SQL conditions from filter object
 */
function buildConditions(filters: ScreeningFilters): SQL[] {
  const conditions: SQL[] = [
    gte(screenings.datetime, filters.startDate),
    lte(screenings.datetime, filters.endDate),
  ];

  if (filters.cinemaIds && filters.cinemaIds.length > 0) {
    conditions.push(inArray(screenings.cinemaId, filters.cinemaIds));
  }

  if (filters.formats && filters.formats.length > 0) {
    conditions.push(inArray(screenings.format, filters.formats));
  }

  if (filters.isRepertory !== undefined) {
    conditions.push(eq(films.isRepertory, filters.isRepertory));
  }

  if (filters.festivalOnly) {
    conditions.push(eq(screenings.isFestivalScreening, true));
  }

  if (filters.filmIds && filters.filmIds.length > 0) {
    conditions.push(inArray(screenings.filmId, filters.filmIds));
  }

  return conditions;
}

/**
 * Get screenings with film and cinema details
 */
export async function getScreenings(
  filters: ScreeningFilters,
  limit = 3000
): Promise<ScreeningWithDetails[]> {
  const conditions = buildConditions(filters);

  return db
    .select(screeningWithDetailsSelect)
    .from(screenings)
    .innerJoin(films, eq(screenings.filmId, films.id))
    .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
    .where(and(...conditions))
    .orderBy(screenings.datetime)
    .limit(limit);
}

/**
 * Get screenings for a specific festival
 */
export async function getScreeningsByFestival(
  festivalSlug: string,
  filters: ScreeningFilters,
  limit = 3000
): Promise<{ festival: { id: string } | null; screenings: FestivalScreeningDetails[] }> {
  // First, get the festival ID
  const [festival] = await db
    .select({ id: festivals.id })
    .from(festivals)
    .where(eq(festivals.slug, festivalSlug))
    .limit(1);

  if (!festival) {
    return { festival: null, screenings: [] };
  }

  const conditions = buildConditions(filters);

  const results = await db
    .select(festivalScreeningSelect)
    .from(festivalScreenings)
    .innerJoin(screenings, eq(festivalScreenings.screeningId, screenings.id))
    .innerJoin(films, eq(screenings.filmId, films.id))
    .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
    .where(and(eq(festivalScreenings.festivalId, festival.id), ...conditions))
    .orderBy(screenings.datetime)
    .limit(limit);

  return { festival, screenings: results };
}

/**
 * Get screenings for a specific season (e.g., director retrospective)
 */
export async function getScreeningsBySeason(
  seasonSlug: string,
  filters: ScreeningFilters,
  limit = 3000
): Promise<{ season: { id: string; name: string } | null; screenings: ScreeningWithDetails[] }> {
  // First, get the season
  const [season] = await db
    .select({ id: seasons.id, name: seasons.name })
    .from(seasons)
    .where(eq(seasons.slug, seasonSlug))
    .limit(1);

  if (!season) {
    return { season: null, screenings: [] };
  }

  // Get all film IDs in this season
  const seasonFilmIds = await db
    .select({ filmId: seasonFilms.filmId })
    .from(seasonFilms)
    .where(eq(seasonFilms.seasonId, season.id));

  const filmIds = seasonFilmIds.map((sf) => sf.filmId);

  if (filmIds.length === 0) {
    return { season, screenings: [] };
  }

  // Add film ID filter
  const filtersWithFilms: ScreeningFilters = {
    ...filters,
    filmIds,
  };

  const results = await getScreenings(filtersWithFilms, limit);
  return { season, screenings: results };
}

/**
 * Parse a cursor string into datetime + id components.
 * Cursor format: "{ISO datetime}_{screening UUID}"
 */
export function parseCursor(cursor: string): { datetime: string; id: string } | null {
  const separatorIndex = cursor.lastIndexOf("_");
  if (separatorIndex === -1) return null;

  const datetime = cursor.slice(0, separatorIndex);
  const id = cursor.slice(separatorIndex + 1);

  // Basic validation
  if (!datetime || !id || isNaN(Date.parse(datetime))) return null;
  return { datetime, id };
}

/**
 * Build a cursor string from a screening
 */
export function buildCursor(screening: ScreeningWithDetails): string {
  return `${screening.datetime.toISOString()}_${screening.id}`;
}

export interface CursorPaginatedResult {
  screenings: ScreeningWithDetails[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Get screenings with cursor-based pagination.
 * Orders by (datetime, id) for deterministic pagination.
 */
export async function getScreeningsWithCursor(
  filters: ScreeningFilters,
  cursor?: string,
  limit = 200
): Promise<CursorPaginatedResult> {
  const conditions = buildConditions(filters);

  // Add cursor condition: (datetime, id) > (cursorDatetime, cursorId)
  if (cursor) {
    const parsed = parseCursor(cursor);
    if (parsed) {
      conditions.push(
        sql`(${screenings.datetime}, ${screenings.id}) > (${parsed.datetime}::timestamptz, ${parsed.id})`
      );
    }
  }

  // Fetch limit + 1 to detect if there are more results
  const results = await db
    .select(screeningWithDetailsSelect)
    .from(screenings)
    .innerJoin(films, eq(screenings.filmId, films.id))
    .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
    .where(and(...conditions))
    .orderBy(screenings.datetime, screenings.id)
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const screeningsPage = hasMore ? results.slice(0, limit) : results;
  const nextCursor =
    hasMore && screeningsPage.length > 0
      ? buildCursor(screeningsPage[screeningsPage.length - 1])
      : null;

  return {
    screenings: screeningsPage,
    cursor: nextCursor,
    hasMore,
  };
}

/**
 * Get recent screenings for a specific cinema
 * Used for cinema health checks and verification
 */
export async function getRecentScreeningsForCinema(
  cinemaId: string,
  limit = 50
): Promise<ScreeningWithDetails[]> {
  const now = new Date();

  return db
    .select(screeningWithDetailsSelect)
    .from(screenings)
    .innerJoin(films, eq(screenings.filmId, films.id))
    .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
    .where(and(eq(screenings.cinemaId, cinemaId), gte(screenings.datetime, now)))
    .orderBy(screenings.datetime)
    .limit(limit);
}
