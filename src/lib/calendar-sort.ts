export type CalendarSortableFilm = {
  film: {
    letterboxdRating: number | null | undefined;
    tmdbPopularity?: number | null | undefined;
  };
  screenings: Array<{ datetime: string }>;
};

function getEarliestScreeningTime(screenings: Array<{ datetime: string }>): number {
  const first = screenings[0]?.datetime;
  if (!first) return Number.POSITIVE_INFINITY;

  const time = new Date(first).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/**
 * Live calendar ordering:
 * 1. Films with a Letterboxd rating first
 * 2. Higher Letterboxd rating
 * 3. Higher TMDB popularity
 * 4. Earlier upcoming screening
 */
export function compareFilmsByCalendarPriority<T extends CalendarSortableFilm>(a: T, b: T): number {
  const aHasRating = a.film.letterboxdRating != null;
  const bHasRating = b.film.letterboxdRating != null;
  if (aHasRating !== bHasRating) return Number(bHasRating) - Number(aHasRating);

  const aRating = a.film.letterboxdRating ?? -1;
  const bRating = b.film.letterboxdRating ?? -1;
  if (aRating !== bRating) return bRating - aRating;

  const aPopularity = a.film.tmdbPopularity ?? -1;
  const bPopularity = b.film.tmdbPopularity ?? -1;
  if (aPopularity !== bPopularity) return bPopularity - aPopularity;

  return getEarliestScreeningTime(a.screenings) - getEarliestScreeningTime(b.screenings);
}
