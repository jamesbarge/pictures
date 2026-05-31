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

export interface ScreeningResult {
  kind: "screening";
  id: string;
  datetime: string;
  format: string | null;
  eventType: string | null;
  bookingUrl: string;
  isSoldOut: boolean;
  filmId: string;
  filmTitle: string;
  filmPosterUrl: string | null;
  cinemaId: string;
  cinemaName: string;
  cinemaShortName: string | null;
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

export interface RecentResult {
  kind: "recent";
  id: string;
  query: string;
}

export interface UserStatusResult {
  kind: "user-status";
  id: string;
  filmId: string;
  filmTitle: string;
  filmYear: number | null;
  filmPosterUrl: string | null;
  status: "want_to_see" | "seen" | "not_interested";
  addedAt?: string;
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
  | ScreeningResult
  | FestivalResult
  | SeasonResult
  | FilterActionResult
  | RecentResult
  | UserStatusResult
  | PersonResult;

/**
 * Sectioned results — order matters for display, and we flatten this
 * into a single array to compute the flat selectedIndex used by
 * keyboard navigation.
 */
export interface PaletteResults {
  recents?: RecentResult[];
  actions?: FilterActionResult[];
  screenings?: ScreeningResult[];
  films?: FilmResult[];
  people?: PersonResult[];
  cinemas?: CinemaResult[];
  festivals?: FestivalResult[];
  seasons?: SeasonResult[];
  userStatuses?: UserStatusResult[];
}

export const EMPTY_RESULTS: PaletteResults = {};

/**
 * Section ordering for the palette. Sections with empty arrays don't
 * render their header. The order is intentional: when temporal intent
 * is present, screenings are most relevant; otherwise films lead.
 */
export const SECTION_ORDER: Array<keyof PaletteResults> = [
  "recents",
  "actions",
  "screenings",
  "films",
  "people",
  "cinemas",
  "festivals",
  "seasons",
  "userStatuses",
];

/**
 * Section header labels — uppercase tracked per the Swiss brutalist
 * design system.
 */
export const SECTION_LABELS: Record<keyof PaletteResults, string> = {
  recents: "RECENT",
  actions: "JUMP TO",
  screenings: "SCREENINGS",
  films: "FILMS",
  people: "PEOPLE",
  cinemas: "CINEMAS",
  festivals: "FESTIVALS",
  seasons: "SEASONS",
  userStatuses: "YOUR LIST",
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
