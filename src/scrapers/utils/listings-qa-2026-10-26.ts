/**
 * Exact stored title from the 26 Oct 2026 listings QA.
 * The repair script and the cleaner tests both use this string.
 *
 * Garden listed Cronenberg's Spider as "Spider (2002) with Peter Suschitzky".
 * The year and the cinematographer's guest credit are not part of the title.
 */

export interface GuestTitleRepair {
  from: string;
  to: string;
  year: number;
  note: string;
}

export const GUEST_TITLE_REPAIRS: readonly GuestTitleRepair[] = [
  {
    from: "Spider (2002) with Peter Suschitzky",
    to: "Spider",
    year: 2002,
    note: "with Peter Suschitzky",
  },
];

export interface YearMatchedFilm {
  id: string;
  year: number | null;
  tmdbId: number | null;
}

/**
 * Another film already titled "Spider" is the same work only when its year
 * is the release year. A namesake from any other year stays put: the title
 * is one word.
 */
export function pickSameYearFilm<T extends YearMatchedFilm>(
  candidates: readonly T[],
  sourceId: string,
  year: number,
): T | undefined {
  const matched = candidates.filter(
    (film) => film.id !== sourceId && film.year === year,
  );
  matched.sort((a, b) => Number(Boolean(b.tmdbId)) - Number(Boolean(a.tmdbId)));
  return matched[0];
}
