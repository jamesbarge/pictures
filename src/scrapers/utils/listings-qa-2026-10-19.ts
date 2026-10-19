/**
 * Listing repairs for the 19 Oct 2026 QA.
 *
 * Title case of a fully shouted film ("THE MAD BOMBER") is #830's storage
 * and API-read path. This module only title-cases a title once a strand
 * prefix has been removed, because that result is still shouted and the
 * two-letter "Ms. 45" case is handled in the cleaner.
 */

import { cleanFilmTitleWithMetadata } from "./film-title-cleaner";
import { sanitizeDirectors } from "./film-write-guards";

const SMALL_WORDS = new Set([
  "a", "an", "the", "of", "and", "or", "in", "on", "for", "to", "with", "at", "by", "from",
]);

const NOTE_SUFFIX =
  /book\s+launch|introduction|\bintro\b|live\s+score|anniversary|\bencore\b|costume\s+party|networking|shadow\s+cast|director['’]s\s+cut|screen\s?talk|\bawards?\b/i;

const RUNTIME_DIRECTOR = /^(\d{1,3})\s*m(?:in(?:ute)?s?)?\.?$/i;

const EXACT_TITLES: Record<string, { title: string; eventNote: string }> = {
  // The day card stored the ellipsis. The event page h1 is
  // "Peven Everett: Voice of a Generation + ScreenTalk …"; the cleaner
  // reduces that h1 to this title. Re-cleaning the fragment cannot.
  "Voice of a Gener...": {
    title: "Voice of a Generation",
    eventNote: "ScreenTalk with director Denholm Hewlett and Peven Everett",
  },
};

export interface ListingsQaFilmPlan {
  title: string;
  directors: string[];
  year: number | null;
  runtime: number | null;
  eventNote: string | null;
}

function tidyEdge(value: string): string {
  return value.replace(/^[\s:+–—-]+|[\s:+–—-]+$/g, "").trim();
}

function tidyNote(suffix: string): string {
  const trimmed = tidyEdge(suffix).replace(/\s*\((?:U|PG|12A?|15|18)\*?\)\s*$/i, "").trim();
  if (/basement\s+nunsploitation\s+costume\s+party/i.test(trimmed)) {
    return "Basement nunsploitation costume party";
  }
  if (/^encore$/i.test(trimmed)) return "Encore";
  if (/director['’]s\s+cut/i.test(trimmed)) return "Director's Cut";
  return trimmed;
}

/** Strand or extra the cleaner removed, for screening.eventDescription. */
export function eventNoteFromTitle(title: string): string | undefined {
  const exact = EXACT_TITLES[title];
  if (exact) return exact.eventNote;

  const meta = cleanFilmTitleWithMetadata(title);
  if (meta.cleanedTitle.trim() === title.trim()) return undefined;

  const parts: string[] = [];
  if (meta.strippedPrefix) {
    const prefix = tidyEdge(meta.strippedPrefix);
    if (prefix) parts.push(prefix);
  }
  if (meta.strippedSuffix && NOTE_SUFFIX.test(meta.strippedSuffix)) {
    const suffix = tidyNote(meta.strippedSuffix);
    if (suffix) parts.push(suffix);
  }
  if (
    parts.length === 0 &&
    /\(\s*(?:the\s+)?director['’]s\s+cut\s*\)/i.test(title)
  ) {
    return "Director's Cut";
  }
  return parts.length > 0 ? parts.join(" + ") : undefined;
}

/** Title-case a shouted strand remainder. Mixed case and two-letter titles stay. */
export function shoutedRemainder(title: string): string {
  if (/\p{Ll}/u.test(title)) return title;
  const letters = title.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4) return title;
  const words = title.split(/\s+/).filter(Boolean);
  let index = 0;
  return title.split(/(\s+)/).map((part) => {
    if (/^\s+$/.test(part)) return part;
    const position = index++;
    if (!/\p{L}/u.test(part)) return part;
    const core = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();
    if (SMALL_WORDS.has(core) && position > 0 && position < words.length - 1) {
      return part.toLowerCase();
    }
    const lower = part.toLowerCase();
    return lower.replace(/\p{L}/u, (character, offset) =>
      offset === 0 ? character.toUpperCase() : character,
    );
  }).join("");
}

function runtimeFromDirector(directors: readonly string[]): number | null {
  if (directors.length !== 1) return null;
  const match = directors[0].trim().match(RUNTIME_DIRECTOR);
  if (!match) return null;
  const minutes = Number(match[1]);
  return minutes >= 1 && minutes <= 600 ? minutes : null;
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * What one stored film row should become. Null when the row is already in
 * the repaired shape. Does not delete rows.
 */
export function planListingsQaFilm(row: {
  title: string;
  directors?: readonly string[] | null;
  year?: number | null;
  runtime?: number | null;
}): ListingsQaFilmPlan | null {
  const directorsIn = [...(row.directors ?? [])];
  const year = row.year ?? null;
  const runtimeIn = row.runtime ?? null;
  const directors = sanitizeDirectors(directorsIn);
  const fromCredit = runtimeFromDirector(directorsIn);
  const runtime = runtimeIn == null && fromCredit != null ? fromCredit : runtimeIn;

  const exact = EXACT_TITLES[row.title];
  let title = row.title;
  if (exact) {
    title = exact.title;
  } else {
    const cleaned = cleanFilmTitleWithMetadata(row.title).cleanedTitle;
    title = cleaned !== row.title ? shoutedRemainder(cleaned) : cleaned;
  }

  const eventNote = eventNoteFromTitle(row.title) ?? null;
  const directorsChanged = !sameList(directors, directorsIn);
  if (title === row.title && !directorsChanged && runtime === runtimeIn && !eventNote) {
    return null;
  }
  return { title, directors, year, runtime, eventNote };
}

const ELECTRIC_PROGRAMME = /^https?:\/\/(?:www\.)?electriccinema\.co\.uk\/programme\/?$/i;

/**
 * A White City row whose API `link` was false. The screening id is the
 * ticket path. Null when this is not that fallback.
 */
export function repairElectricProgrammeUrl(row: {
  bookingUrl: string | null;
  sourceId: string | null;
  availabilityStatus?: string | null;
}): { bookingUrl: string; availabilityStatus: "sold_out" } | null {
  if (!row.bookingUrl || !ELECTRIC_PROGRAMME.test(row.bookingUrl)) return null;
  const id = row.sourceId?.match(/^electric-(\d+)$/)?.[1];
  if (!id) return null;
  const bookingUrl = `https://www.electriccinema.co.uk/tickets/${id}`;
  if (row.bookingUrl === bookingUrl && row.availabilityStatus === "sold_out") return null;
  return { bookingUrl, availabilityStatus: "sold_out" };
}
