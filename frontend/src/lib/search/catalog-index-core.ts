/**
 * Pure (no runes, no `$app`, no network) core of the in-browser search index:
 * builds the MiniSearch indexes and runs synchronous fuzzy search. Kept
 * separate from `catalog-index.svelte.ts` so it's directly unit-testable.
 */

import MiniSearch from "minisearch";
import type { CinemaResult, FilmResult, PersonResult } from "./result-types";

// ---- Raw payload from GET /api/search/catalog ----
interface CatalogFilm {
  id: string;
  title: string;
  year: number | null;
  directors: string[];
  posterUrl: string | null;
}
interface CatalogCinema {
  id: string;
  name: string;
  shortName: string | null;
  area: string | null;
}
interface CatalogPerson {
  name: string;
  role: "director";
  filmCount: number;
}
export interface CatalogResponse {
  films: CatalogFilm[];
  cinemas: CatalogCinema[];
  people: CatalogPerson[];
  generatedAt?: string;
}

// Result limits mirror the server search (`/api/films/search`).
const FILM_LIMIT = 12;
const CINEMA_LIMIT = 6;
const PEOPLE_LIMIT = 5;
const MIN_QUERY_LEN = 2;

/**
 * Lowercase + strip diacritics so an accent-free, mistyped query matches an
 * accented title ("amelei" → "Amélie"). Mirrors the server's `unaccent`.
 * Applied as MiniSearch `processTerm` to BOTH indexing and querying, so the two
 * stay in the same normalized space.
 */
function normalizeTerm(term: string): string | null {
  const t = term
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return t.length > 0 ? t : null;
}

// fuzzy: edit-distance tolerance (typos); prefix: match partial words as you type.
// 0.3 (not 0.2) so a 6-char transposition like "amelei" → "Amélie" (Levenshtein
// distance 2) still matches — verified the common typo classes resolve cleanly.
const SEARCH_OPTS = { fuzzy: 0.3, prefix: true } as const;

/**
 * Keep the first item per key. MiniSearch `addAll` THROWS on a duplicate doc id
 * and aborts the whole index build, so a single dup (e.g. two directors sharing
 * a name) would otherwise kill ALL search. The catalog payload is unique today
 * (SQL GROUP BY / PK ids) — this is cheap defense in depth.
 */
function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export interface CatalogIndexes {
  filmIndex: MiniSearch;
  cinemaIndex: MiniSearch;
  personIndex: MiniSearch;
  filmById: Map<string, FilmResult>;
  cinemaById: Map<string, CinemaResult>;
  personByName: Map<string, PersonResult>;
}

/** Build the three fuzzy indexes from a catalog snapshot. PURE. */
export function buildCatalogIndexes(data: CatalogResponse): CatalogIndexes {
  const filmById = new Map<string, FilmResult>();
  const filmIndex = new MiniSearch({
    fields: ["title", "directors"],
    processTerm: normalizeTerm,
    searchOptions: { boost: { title: 3 }, ...SEARCH_OPTS },
  });
  filmIndex.addAll(
    dedupeBy(data.films, (f) => f.id).map((f) => {
      filmById.set(f.id, {
        kind: "film",
        id: f.id,
        title: f.title,
        year: f.year,
        directors: f.directors ?? [],
        posterUrl: f.posterUrl,
      });
      // directors[] joined into one searchable string so a director's name is
      // fuzzy-matchable alongside the title.
      return { id: f.id, title: f.title, directors: (f.directors ?? []).join(" ") };
    }),
  );

  const cinemaById = new Map<string, CinemaResult>();
  const cinemaIndex = new MiniSearch({
    fields: ["name", "shortName", "area"],
    processTerm: normalizeTerm,
    searchOptions: { boost: { name: 3, shortName: 2 }, ...SEARCH_OPTS },
  });
  cinemaIndex.addAll(
    dedupeBy(data.cinemas, (c) => c.id).map((c) => {
      cinemaById.set(c.id, {
        kind: "cinema",
        id: c.id,
        name: c.name,
        shortName: c.shortName,
        address: c.area,
      });
      return { id: c.id, name: c.name, shortName: c.shortName ?? "", area: c.area ?? "" };
    }),
  );

  // People have no id — the name is the /people/[name] route param and a stable key.
  const personByName = new Map<string, PersonResult>();
  const personIndex = new MiniSearch({
    fields: ["name"],
    processTerm: normalizeTerm,
    searchOptions: { ...SEARCH_OPTS },
  });
  personIndex.addAll(
    dedupeBy(data.people, (p) => p.name).map((p) => {
      personByName.set(p.name, {
        kind: "person",
        name: p.name,
        filmCount: p.filmCount,
        role: p.role,
      });
      return { id: p.name, name: p.name };
    }),
  );

  return { filmIndex, cinemaIndex, personIndex, filmById, cinemaById, personByName };
}

export interface CatalogSearchResults {
  films: FilmResult[];
  people: PersonResult[];
  cinemas: CinemaResult[];
}

export const EMPTY_CATALOG_RESULTS: CatalogSearchResults = {
  films: [],
  people: [],
  cinemas: [],
};

/** Synchronous fuzzy search across the three indexes. PURE. */
export function searchCatalog(idx: CatalogIndexes, query: string): CatalogSearchResults {
  const q = query.trim();
  if (q.length < MIN_QUERY_LEN) return EMPTY_CATALOG_RESULTS;

  const films = idx.filmIndex
    .search(q)
    .slice(0, FILM_LIMIT)
    .map((r) => idx.filmById.get(String(r.id)))
    .filter((x): x is FilmResult => x !== undefined);

  const cinemas = idx.cinemaIndex
    .search(q)
    .slice(0, CINEMA_LIMIT)
    .map((r) => idx.cinemaById.get(String(r.id)))
    .filter((x): x is CinemaResult => x !== undefined);

  const people = idx.personIndex
    .search(q)
    .slice(0, PEOPLE_LIMIT)
    .map((r) => idx.personByName.get(String(r.id)))
    .filter((x): x is PersonResult => x !== undefined);

  return { films, people, cinemas };
}
