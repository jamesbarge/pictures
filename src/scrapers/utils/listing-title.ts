/**
 * Listing-title repairs for the 2026-10-18 QA.
 *
 * Possessive credits ("Ken Russell's The Devils") stay in `cleanFilmTitle` —
 * some of them are the film's own title. Matching and storage decide when the
 * credit is the director or the author. Shouted Rio titles are title-cased
 * here, not inside the cleaner, so the cleaner's ALL-CAPS fixtures stay put.
 */

import { cleanFilmTitleWithMetadata } from "./film-title-cleaner";

const SMALL_WORDS = new Set([
  "a", "an", "the", "of", "and", "or", "in", "on", "for", "to", "with", "at", "by", "from",
]);

const ROMAN = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|xi|xii)$/;

/** "Ken Russell's …", "J.G.Ballard's …". One-word credits without a dot stay ("Schindler's List"). */
const POSSESSIVE_CREDIT =
  /^((?:\p{Lu}[\p{L}.]*\.?)(?:\s+\p{Lu}[\p{L}.]*\.?){0,2})['\u2019]s\s+(.+)$/u;

export function foldName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function namesMatch(a: string, b: string): boolean {
  const left = foldName(a);
  const right = foldName(b);
  return left.length > 0 && left === right;
}

export function splitPossessiveCredit(title: string): { credit: string; rest: string } | null {
  const match = title.match(POSSESSIVE_CREDIT);
  if (!match) return null;
  const credit = match[1].trim();
  const rest = match[2].trim();
  if (!rest) return null;
  if (!credit.includes(" ") && !credit.includes(".")) return null;
  return { credit, rest };
}

/**
 * Use the stripped title when the credit is the film's director, or when the
 * credit is an initialled author ("J.G.Ballard") and the scraper's director
 * is the film's director. "Bram Stoker's Dracula" has no initial and the
 * credit is not the director, so it stays.
 */
export function preferStrippedPossessive(
  credit: string,
  filmDirectors: readonly string[] | null | undefined,
  scraperDirector?: string,
): boolean {
  const directors = filmDirectors ?? [];
  if (directors.some((director) => namesMatch(director, credit))) return true;
  if (!scraperDirector || !credit.includes(".")) return false;
  const scraperMatches = directors.some((director) => namesMatch(director, scraperDirector));
  const creditMatches = directors.some((director) => namesMatch(director, credit));
  return scraperMatches && !creditMatches;
}

/** Extra cache keys for Se7en / Seven. "seven" aliases only when the director is Fincher. */
export function stylizedLookupKeys(normalized: string, director?: string): string[] {
  if (normalized === "se7en") return ["seven"];
  if (normalized === "seven" && !!director && namesMatch(director, "David Fincher")) return ["se7en"];
  return [];
}

export function sameListingTitle(
  a: { title: string; directors?: readonly string[] | null },
  b: { title: string; directors?: readonly string[] | null },
  normalize: (title: string) => string,
): boolean {
  const left = normalize(a.title);
  const right = normalize(b.title);
  if (left === right) return true;
  const pair = new Set([left, right]);
  if (!pair.has("se7en") || !pair.has("seven")) return false;
  const directors = [...(a.directors ?? []), ...(b.directors ?? [])];
  if (directors.some((director) => namesMatch(director, "David Fincher"))) return true;
  return /se7en/i.test(a.title) || /se7en/i.test(b.title);
}

function titleCaseWord(word: string, small: boolean): string {
  const lower = word.toLowerCase();
  if (small) return lower;
  const letters = lower.replace(/[^a-z]/g, "");
  if (letters && ROMAN.test(letters)) {
    return word.replace(/[A-Za-z]+/g, (token) => token.toUpperCase());
  }
  let done = false;
  return lower.replace(/\p{L}/u, (character) => {
    if (done) return character;
    done = true;
    return character.toUpperCase();
  });
}

/**
 * Rio publishes titles in capitals. Leave mixed case, short tokens and
 * acronyms of four letters ("NOFX") alone. "SE7EN" still becomes "Se7en".
 */
export function shoutedTitleToDisplay(title: string): string {
  if (/\p{Ll}/u.test(title)) return title;
  const letters = title.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4) return title;
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length === 1 && letters.length <= 4 && !/\d/.test(title)) return title;

  let index = 0;
  return title.split(/(\s+)/).map((part) => {
    if (/^\s+$/.test(part)) return part;
    const position = index++;
    const core = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();
    const small = SMALL_WORDS.has(core) && position !== 0 && position !== words.length - 1;
    return titleCaseWord(part, small);
  }).join("");
}

/** Title written on a new film row when TMDB did not supply one. */
export function storageTitle(title: string, scraperDirector?: string): string {
  const display = shoutedTitleToDisplay(title);
  const split = splitPossessiveCredit(display);
  if (!split || !scraperDirector) return display;
  const creditIsDirector = namesMatch(split.credit, scraperDirector);
  const authorCredit = split.credit.includes(".") && !creditIsDirector;
  if (creditIsDirector || authorCredit) return shoutedTitleToDisplay(split.rest);
  return display;
}

export interface ListingTitleRepair {
  title: string;
  directors: string[];
  year: number | null;
}

/**
 * What a stored film row should become. Exact QA titles are handled even when
 * the row has no director; everything else goes through the cleaner, shouted
 * title case, and the initialled-author rule. Returns null when nothing changes.
 */
export function planListingTitleRepair(row: {
  title: string;
  directors?: readonly string[] | null;
  year?: number | null;
}): ListingTitleRepair | null {
  const directors = [...(row.directors ?? [])];
  let title = row.title;
  let year = row.year ?? null;
  let changed = false;

  const setTitle = (next: string) => {
    if (next && next !== title) {
      title = next;
      changed = true;
    }
  };
  const setYear = (next: number) => {
    if (year !== next) {
      year = next;
      changed = true;
    }
  };

  if (/^ken russell['’]s the devils$/i.test(title.trim())) setTitle("The Devils");

  // The Cinema Museum page was renamed. The stored film is The Evil Dead; the
  // booking URL and the page title are The Return of the Living Dead (1985).
  if (/^horror for a cause\b/i.test(row.title) && /evil dead/i.test(row.title)) {
    setTitle("The Return of the Living Dead");
    if (year == null || year === 1981) setYear(1985);
  }

  const gordon = directors.some((director) => namesMatch(director, "Bette Gordon"));
  const folded = foldName(title);
  if (folded === "returntothetatler" && gordon) {
    setTitle("Variety");
    setYear(1983);
  }
  if (foldName(title) === "variety" && gordon && year === 1985) setYear(1983);

  if (/^seven$/i.test(title) && directors.some((director) => namesMatch(director, "David Fincher"))) {
    setTitle("Se7en");
    if (year == null) setYear(1995);
  }

  for (let i = 0; i < directors.length; i++) {
    if (directors[i].trim() === "ype Williams") {
      directors[i] = "Hype Williams";
      changed = true;
    }
  }

  const meta = cleanFilmTitleWithMetadata(title);
  let next = shoutedTitleToDisplay(meta.cleanedTitle);
  const split = splitPossessiveCredit(next);
  if (split?.credit.includes(".") && directors.some((director) => !namesMatch(director, split.credit))) {
    next = shoutedTitleToDisplay(split.rest);
  }
  if (next !== title) {
    title = next;
    changed = true;
  }
  if (meta.extractedYear != null && year == null) setYear(meta.extractedYear);

  if (!changed) return null;
  const directorsChanged = directors.some((director, i) => director !== (row.directors ?? [])[i]);
  if (title === row.title && year === (row.year ?? null) && !directorsChanged) return null;
  return { title, directors, year };
}

const GENERIC_BOOKING_LAST = new Set([
  "schedule", "whats-on", "whatson", "programme", "program", "calendar", "home", "book",
]);

/** A booking URL that identifies one event, not a venue calendar. */
export function isSpecificBookingUrl(url: string | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (/^\d+$/.test(parsed.searchParams.get("f") ?? "")) return true;
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return false;
  return !GENERIC_BOOKING_LAST.has((parts[parts.length - 1] ?? "").toLowerCase());
}

/** True when the URL slug contains the film title (ignoring a leading "The"). */
export function bookingUrlNamesTitle(url: string, title: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const needle = foldName(title.replace(/^the\s+/i, ""));
  if (needle.length < 8) return false;
  return foldName(`${parsed.pathname} ${parsed.search}`).includes(needle);
}
