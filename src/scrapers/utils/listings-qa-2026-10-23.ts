/**
 * Stored-row plans for the 23 Oct 2026 listings QA.
 * The repair script is dry-run unless --execute. This module does not touch
 * the database.
 */

import {
  existingPartListingTitles,
  planStoredListingTitle,
  type StoredListingTitlePlan,
} from "./film-title-cleaner";

export interface RepairFilm {
  id: string;
  title: string;
  year: number | null;
  tmdbId: number | null;
  posterUrl: string | null;
}

export function listingTitlePlan(title: string): StoredListingTitlePlan | null {
  return planStoredListingTitle(title);
}

export function partListingTargets(title: string): string[] {
  return existingPartListingTitles(title);
}

/** Curzon Bloomsbury rows whose booking URL is the DocHouse strand. */
export function isCurzonDocHouseDuplicate(cinemaId: string, bookingUrl: string): boolean {
  return (
    cinemaId === "curzon-bloomsbury"
    && bookingUrl.startsWith("https://www.curzon.com/films/dochouse-")
  );
}

function yearsAgree(filmYear: number | null, hint: number | null): boolean {
  if (filmYear == null || hint == null) return true;
  return Math.abs(filmYear - hint) <= 1;
}

function score(film: RepairFilm, hint: number | null): number {
  let value = 0;
  if (film.tmdbId) value += 100;
  if (film.posterUrl) value += 10;
  if (film.year != null) value += 5;
  if (hint != null && film.year != null && Math.abs(film.year - hint) <= 1) value += 30;
  return value;
}

/**
 * The other film a repaired title should move onto, or null to rename in
 * place. A candidate whose year disagrees with the plan (or with the row's
 * own year, when the title carries none) is ignored. The candidate has to
 * outscore the row being repaired.
 */
export function chooseListingCanonical(
  self: RepairFilm,
  candidates: RepairFilm[],
  plan: { year: number | null },
): RepairFilm | null {
  const hint = plan.year ?? self.year;
  const others = candidates.filter((film) => film.id !== self.id && yearsAgree(film.year, hint));
  if (others.length === 0) return null;
  others.sort((a, b) => score(b, hint) - score(a, hint) || a.id.localeCompare(b.id));
  const best = others[0];
  if (score(best, hint) > score(self, hint)) return best;
  return null;
}
