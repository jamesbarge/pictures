/**
 * Stored titles from the 31 Oct 2026 listings QA.
 * The repair script and the tests both use these strings.
 * The cleaner is what a scrape applies; this module only decides which
 * existing row to keep.
 */

import { cleanFilmTitle, listingEventNote, strandSeasonNote } from "./film-title-cleaner";

export const LISTING_QA_2026_10_31_TITLES = [
  "Festive Fun with Peppa Cinema Experience",
  "SLA 2026: A Silent Voice",
  "SLA 2026: A New Dawn",
  "SLA 2026: Ghost",
  "SLA 2026: Ninja Scroll",
  "SLA 2026: The Keeper of the Camphor Tree",
  "SLA 2026: We Are Aliens",
  "Italian cocktails, Morricone musical intro + Ennio",
  "'Wicker Sour' cocktails, straw man making + Wicker",
  "All Out Of Bubblegum Film Club: THE SHINING",
] as const;

/**
 * The cleaner leaves Rio's club title in capitals. The film people already
 * have is "The Shining", and a rename should use that casing.
 */
const DESTINATION_CASE: Record<string, string> = {
  "the shining": "The Shining",
};

export function destinationTitle(stored: string): string {
  const cleaned = cleanFilmTitle(stored);
  return DESTINATION_CASE[cleaned.toLowerCase()] ?? cleaned;
}

export interface CanonicalFilm {
  id: string;
  year: number | null;
  tmdbId: number | null;
}

/**
 * Prefer a film of the same release year, then one TMDB already knows.
 * Peppa's marketing title has no year, so the 2026 TMDB row wins.
 * The Shining's 1980 row wins over a namesake from another year.
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

/** Note to write, or undefined when the screening already has a real one. */
export function repairedEventDescription(
  existing: string | null | undefined,
  destination: string,
  note: string | null,
): string | undefined {
  if (!note) return undefined;
  const current = existing?.trim() ?? "";
  if (!current || current.toLowerCase() === destination.trim().toLowerCase()) return note;
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

export interface TicketCopy {
  id: string;
  filmTitle: string;
  tmdbId: number | null;
}

/**
 * Extra copies of one showing. Only when every title cleans to the same film,
 * so Garden's Spanish and English cards on one performance id are left alone.
 * Keeps the row whose stored title is already clean, then the one with a TMDB id.
 */
export function chooseTicketSurvivor<T extends TicketCopy>(
  rows: readonly T[],
): { keep: T; drop: T[] } | null {
  if (rows.length < 2) return null;
  const cleaned = rows.map((row) => ({
    row,
    title: cleanFilmTitle(row.filmTitle).trim().toLowerCase(),
  }));
  const titles = new Set(cleaned.map((item) => item.title));
  if (titles.size !== 1) return null;

  const ranked = [...cleaned].sort((a, b) => {
    const aClean = a.row.filmTitle.trim().toLowerCase() === a.title ? 1 : 0;
    const bClean = b.row.filmTitle.trim().toLowerCase() === b.title ? 1 : 0;
    if (aClean !== bClean) return bClean - aClean;
    const aTmdb = a.row.tmdbId != null ? 1 : 0;
    const bTmdb = b.row.tmdbId != null ? 1 : 0;
    if (aTmdb !== bTmdb) return bTmdb - aTmdb;
    return a.row.id < b.row.id ? -1 : 1;
  });
  return { keep: ranked[0].row, drop: ranked.slice(1).map((item) => item.row) };
}

export { listingEventNote, strandSeasonNote };
