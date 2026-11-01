/**
 * Stored titles from the 1 Nov 2026 listings QA.
 * The repair script and the tests both use these strings.
 * The cleaner is what a scrape applies; this module only decides which
 * existing row to keep.
 */

import { cleanFilmTitle, listingEventNote, listingSeasonNote, versionScreeningNote } from "./film-title-cleaner";

/** Live film titles on 15 Nov 2026. The apostrophe in the BFI title is U+2019. */
export const LISTING_QA_2026_11_01_TITLES = [
  "MUBI FEST LIVE: A LONG WINTER",
  "Little Shop of Horrors (director\u2019s Cut)",
] as const;

export function destinationTitle(stored: string): string {
  return cleanFilmTitle(stored);
}

/** Note to write when the screening has none. Q&A already stored is left alone. */
export function repairNote(stored: string): string | null {
  return versionScreeningNote(stored) ?? listingEventNote(stored);
}

/** Programme name for screenings.season. */
export function repairSeason(stored: string): string | null {
  return listingSeasonNote(stored);
}

export interface CanonicalFilm {
  id: string;
  year: number | null;
  tmdbId: number | null;
}

/**
 * Prefer a film of the same release year, then one TMDB already knows.
 * Little Shop of Horrors has a 1960 namesake; the BFI row is 1986.
 * A Long Winter has no year on the bad row, so a TMDB row wins.
 */
export function pickCanonicalFilm<T extends CanonicalFilm>(
  source: T,
  candidates: readonly T[],
): T | undefined {
  const ranked = candidates
    .filter((film) => film.id !== source.id)
    .map((film) => ({ film, score: canonicalScore(film, source) }))
    .sort((a, b) => b.score - a.score || a.film.id.localeCompare(b.film.id));
  return ranked[0]?.film;
}

function canonicalScore(film: CanonicalFilm, source: CanonicalFilm): number {
  let score = 0;
  if (source.year != null && film.year === source.year) score += 4;
  if (film.tmdbId != null) score += 2;
  if (film.year != null) score += 1;
  return score;
}

/**
 * Note to write, or undefined when the screening already has a real one.
 * A note that is only "Q&A" is the event type repeated. The festival name
 * replaces it. eventType stays q_and_a. Any other note is left alone.
 */
export function repairedEventDescription(
  existing: string | null | undefined,
  note: string | null,
  strand: string | null,
): string | undefined {
  if (!note) return undefined;
  const current = existing?.trim() ?? "";
  if (!current) return note;
  if (strand && note === strand && /^q\s*&\s*a$/i.test(current)) return note;
  return undefined;
}

/** Season to write, or undefined when one is already set. */
export function repairedSeason(
  existing: string | null | undefined,
  strand: string | null,
): string | undefined {
  if (!strand || existing?.trim()) return undefined;
  return strand;
}
