/**
 * Result row types for the command palette.
 *
 * A `ResultRow` is a discriminated union — each `kind` corresponds to
 * one row component variant. The flat result list mixes types in a
 * single array indexed by `palette.selectedIndex` so arrow-key nav
 * walks across sections without needing per-section state.
 */

export interface FilmResult {
  kind: "film";
  id: string;
  title: string;
  year: number | null;
  directors: string[];
  posterUrl: string | null;
  genres?: string[];
  tmdbRating?: number | null;
  nextScreeningAt?: string | null;
  provisional?: boolean;
}

export interface CinemaResult {
  kind: "cinema";
  id: string;
  name: string;
  shortName: string | null;
  address: string | null;
  chain?: string | null;
}

export interface FestivalResult {
  kind: "festival";
  id: string;
  name: string;
  slug: string;
  shortName: string | null;
  year: number;
  startDate: string;
  endDate: string;
  logoUrl: string | null;
}

export interface SeasonResult {
  kind: "season";
  id: string;
  name: string;
  slug: string;
  directorName: string | null;
  startDate: string;
  endDate: string;
  posterUrl: string | null;
}

export interface FilterActionResult {
  kind: "filter-action";
  id: string;
  label: string;
  /** Shortcut hint like "⌥1" (display only — Alt+N keys are handled at the listbox level). */
  shortcut?: string;
}

export interface PersonResult {
  kind: "person";
  /** Person's name — also the route param for /people/[name]. */
  name: string;
  /** How many upcoming films they have showing. */
  filmCount: number;
  role: "director" | "actor";
}

export type ResultRow =
  | FilmResult
  | CinemaResult
  | FestivalResult
  | SeasonResult
  | FilterActionResult
  | PersonResult;

/**
 * Sectioned results — order matters for display, and we flatten this
 * into a single array to compute the flat selectedIndex used by
 * keyboard navigation.
 */
export interface PaletteResults {
  actions?: FilterActionResult[];
  films?: FilmResult[];
  people?: PersonResult[];
  cinemas?: CinemaResult[];
  festivals?: FestivalResult[];
  seasons?: SeasonResult[];
}

export const EMPTY_RESULTS: PaletteResults = {};

/**
 * Section ordering for the palette. Sections with empty arrays don't
 * render their header. Synthesised filter actions lead, then films.
 */
export const SECTION_ORDER: Array<keyof PaletteResults> = [
  "actions",
  "films",
  "people",
  "cinemas",
  "festivals",
  "seasons",
];

/**
 * Section header labels — uppercase tracked per the Swiss brutalist
 * design system.
 */
export const SECTION_LABELS: Record<keyof PaletteResults, string> = {
  actions: "JUMP TO",
  films: "FILMS",
  people: "PEOPLE",
  cinemas: "CINEMAS",
  festivals: "FESTIVALS",
  seasons: "SEASONS",
};

/**
 * Flatten the sectioned results into a single array of rows, in the
 * order they'll render. Each row carries its kind, so `selectedIndex`
 * can point into this array and the row dispatcher knows what to
 * render at each position. Section headers are NOT in this array —
 * arrow nav steps row-by-row, skipping headers entirely.
 */
export function flattenResults(results: PaletteResults): ResultRow[] {
  const flat: ResultRow[] = [];
  for (const section of SECTION_ORDER) {
    const rows = results[section];
    if (!rows || rows.length === 0) continue;
    flat.push(...rows);
  }
  return flat;
}
