/**
 * Exact live strings from the 3 Nov 2026 listings QA.
 * The repair script, the cleaner tests and the director-credit matcher share them.
 *
 * "Ken Russell's The Devils" is not peeled by the regex cleaner. The same
 * shape is a real title ("Bram Stoker's Dracula", "Lee Cronin's The Mummy").
 * It resolves to The Devils only when that film is known and Ken Russell
 * directed it, or when the remainder is the only established film of that
 * title and no director contradicts the credit.
 */

export const KEN_RUSSELLS_DEVILS = "Ken Russell's The Devils";
export const THE_DEVILS = "The Devils";
export const HELL_ON_EARTH =
  "Hell on Earth: The Desecration and Resurrection of The Devils";

export const GARDEN_STRAND_COSMOPOLIS = "Don DeLillo at 90: Cosmopolis with Ben Rivers";
export const GARDEN_YEAR_COSMOPOLIS = "Cosmopolis (2012) with Ben Rivers";
export const COSMOPOLIS = "Cosmopolis";
export const GARDEN_PERFORMANCE_ID = "6283015";

export const TERRORISTS_RAW = '"Terrorists" - London Preview';
export const TERRORISTS = "Terrorists";

export const CASTLE_BIOGRAPHY =
  "My Political Biography - Trans Awareness Programme 2026";
export const MY_POLITICAL_BIOGRAPHY = "My Political Biography";

/** Titles a leading possessive must not rewrite. */
export const POSSESSIVE_TITLES_THAT_STAY = [
  "Schindler's List",
  "Ferris Bueller's Day Off",
  "Rosemary's Baby",
  "My Brother's Wedding",
  "Lee Cronin's The Mummy",
  "Bram Stoker's Dracula",
  "Mary Shelley's Frankenstein",
  "Rob Zombie's Halloween",
  HELL_ON_EARTH,
] as const;

export interface TitleRepair {
  from: string;
  to: string;
  /** Release year the destination must have. Null accepts any year. */
  year: number | null;
  /** Director the destination should have, when one of the candidates does. */
  director: string | null;
  note: string | null;
  season: string | null;
}

export const STORED_TITLE_REPAIRS: readonly TitleRepair[] = [
  {
    from: KEN_RUSSELLS_DEVILS,
    to: THE_DEVILS,
    year: 1971,
    director: "Ken Russell",
    note: null,
    season: null,
  },
  {
    from: GARDEN_STRAND_COSMOPOLIS,
    to: COSMOPOLIS,
    year: 2012,
    director: "David Cronenberg",
    note: "with Ben Rivers",
    season: "Don DeLillo at 90",
  },
  {
    from: GARDEN_YEAR_COSMOPOLIS,
    to: COSMOPOLIS,
    year: 2012,
    director: "David Cronenberg",
    note: "with Ben Rivers",
    season: null,
  },
  {
    from: TERRORISTS_RAW,
    to: TERRORISTS,
    year: null,
    director: null,
    note: "London Preview",
    season: null,
  },
  {
    from: CASTLE_BIOGRAPHY,
    to: MY_POLITICAL_BIOGRAPHY,
    year: null,
    director: null,
    note: "Trans Awareness Programme 2026",
    season: null,
  },
];

export interface RepairFilm {
  id: string;
  title: string;
  year: number | null;
  tmdbId: number | null;
  directors: readonly string[];
}

function looseName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A film already titled the cleaned name. A namesake from another year is
 * not this film: "The Devils" has to be 1971, "Cosmopolis" 2012.
 */
export function pickRepairedFilm<T extends RepairFilm>(
  films: readonly T[],
  repair: TitleRepair,
): T | undefined {
  let matched = films.filter((film) => film.title === repair.to && film.id);
  if (repair.year != null) {
    const dated = matched.filter((film) => film.year === repair.year);
    if (dated.length === 0) return undefined;
    matched = dated;
  }
  if (repair.director) {
    const wanted = looseName(repair.director);
    const directed = matched.filter((film) =>
      film.directors.some((director) => looseName(director) === wanted),
    );
    if (directed.length > 0) matched = directed;
  }
  matched.sort(
    (a, b) => Number(b.tmdbId != null) - Number(a.tmdbId != null),
  );
  return matched[0];
}

/**
 * "First Last's Title". One word ("Schindler's", "Rosemary's") is the film.
 * "My …" is a title ("My Brother's Wedding"), not a director.
 */
const LEADING_PERSONAL_POSSESSIVE =
  /^(?!My\b|His\b|Her\b|Our\b|Their\b|Its\b|The\b|A\b|An\b)(\p{Lu}[\p{L}'’.-]*(?:\s+\p{Lu}[\p{L}'’.-]*){1,2})['’]s\s+(\S(?:.*\S)?)$/u;

export function splitDirectorPossessive(
  title: string,
): { name: string; title: string } | null {
  const match = title.match(LEADING_PERSONAL_POSSESSIVE);
  if (!match) return null;
  const name = match[1].trim();
  const rest = match[2].trim();
  if (rest.length < 2) return null;
  return { name, title: rest };
}

function sameTitle(a: string, b: string): boolean {
  return looseName(a) === looseName(b);
}

function directorMatches(directors: readonly string[], name: string): boolean {
  const wanted = looseName(name);
  return directors.some((director) => looseName(director) === wanted);
}

function preferFilm<T extends RepairFilm>(films: readonly T[]): T {
  return [...films].sort((a, b) => {
    const tmdb = Number(b.tmdbId != null) - Number(a.tmdbId != null);
    if (tmdb !== 0) return tmdb;
    // Several films, one director, no year on the listing: the credit is the
    // original. 1971 wins over a later namesake.
    if (a.year != null && b.year != null && a.year !== b.year) return a.year - b.year;
    return Number(b.year != null) - Number(a.year != null);
  })[0];
}

/**
 * The film a leading "First Last's …" credit should use, or null when the
 * credit is the title.
 *
 * A full-title row with a year or a director blocks the peel. That is
 * "Bram Stoker's Dracula" and "Ferris Bueller's Day Off". The junk row
 * "Ken Russell's The Devils" has neither, so it does not block, and The
 * Devils (1971, Ken Russell) wins.
 *
 * With no director hit, a single established remainder is used only when
 * its director list is empty. A list that names someone else stays put,
 * so "Ferris Bueller's Day Off" cannot land on a film called "Day Off".
 */
export function resolveDirectorPossessive<T extends RepairFilm>(
  title: string,
  films: readonly T[],
): T | null {
  const split = splitDirectorPossessive(title);
  if (!split) return null;

  const full = films.filter((film) => sameTitle(film.title, title));
  // A catalogued film ("Bram Stoker's Dracula", tmdb id) or a film whose
  // directors are someone else ("Ferris Bueller's Day Off") is the title.
  // A junk row with no tmdb id does not block, even after a year or the
  // director was copied onto it: the screenings still belong on the real film.
  const blocked = full.some(
    (film) =>
      film.tmdbId != null ||
      (film.directors.length > 0 && !directorMatches(film.directors, split.name)),
  );
  if (blocked) return null;

  const remainder = films.filter(
    (film) =>
      sameTitle(film.title, split.title) &&
      (film.year != null || film.directors.length > 0 || film.tmdbId != null),
  );
  const directed = remainder.filter((film) => directorMatches(film.directors, split.name));
  if (directed.length > 0) return preferFilm(directed);

  // Full personal name, and the remainder is the only established film of
  // that title, with no director who could contradict the credit.
  if (remainder.length === 1 && remainder[0].directors.length === 0) return remainder[0];
  return null;
}
