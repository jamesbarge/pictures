/**
 * Command palette store (cmd+k global search).
 *
 * Owns:
 *  - `open`            — boolean modal visibility
 *  - `query`           — raw input string
 *  - `parsed`          — derived ParsedIntent from parse-query.ts
 *  - `selectedIndex`   — flat index across all visible result rows
 *  - server-fetch state — handled imperatively (not reactive) so
 *    AbortController identity doesn't trigger effect loops
 *
 * NOT reactive (intentional):
 *  - `inFlight: AbortController | null` — controller identity changes
 *    after abort+replace would re-trigger any effect that reads it;
 *    keep as a plain module variable
 *  - `debounceTimer` — same reason
 *  - `triggerEl` — captured DOM element for focus restoration on
 *    close; never read inside `$derived` so reactivity unnecessary
 *
 * `parsed` reads the clock whenever the query changes, and the query is
 * cleared on every close. A palette left open across midnight keeps the
 * earlier dates until the next keystroke.
 */

import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { apiGet } from "$lib/api/client";
import { filters } from "$lib/stores/filters.svelte";
import { intentToActions } from "$lib/search/intent-to-actions";
import { parseQuery, type ParsedIntent } from "$lib/search/parse-query";
import { catalogIndex } from "$lib/search/catalog-index.svelte";
import {
  EMPTY_RESULTS,
  flattenResults,
  type CinemaResult,
  type FestivalResult,
  type FilmResult,
  type PaletteResults,
  type PersonResult,
  type ResultRow,
  type SeasonResult,
} from "$lib/search/result-types";

/** How the user activated a row. */
export type ActivationMode = "open" | "newTab" | "filter";

const SERVER_DEBOUNCE_MS = 80;
const MIN_QUERY_LEN = 2;

/**
 * Server response shape — the `/api/films/search` route returns rows
 * without the `kind` discriminator; we add it in the mapping function
 * below so downstream code (rows, flattenResults) can be type-safe.
 *
 * The legacy field name `results` (= films) is preserved for backward
 * compat with the existing inline SearchInput; we rename it locally.
 */
interface ServerSearchResponse {
  results: Omit<FilmResult, "kind">[];
  cinemas: Omit<CinemaResult, "kind">[];
  festivals: Omit<FestivalResult, "kind">[];
  seasons: Omit<SeasonResult, "kind">[];
  people?: Omit<PersonResult, "kind">[];
}

let open = $state(false);
let query = $state("");
let selectedIndex = $state(0);
let results = $state<PaletteResults>(EMPTY_RESULTS);
let isLoading = $state(false);

// Plain (non-reactive) imperative state.
let triggerEl: HTMLElement | null = null;
let inFlight: AbortController | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// Derived: parse the query into structured intent every time it changes.
const parsed = $derived<ParsedIntent>(parseQuery(query, new Date()));

// Derived: filter-action rows synthesised from the parsed intent. These
// land at the top of the result list (per SECTION_ORDER) so the user sees
// the "Apply: …" composite action immediately, before any server data.
const actions = $derived(intentToActions(parsed));

// Derived: results with the synthesised actions injected. Keeping the
// merge in the store (rather than a component) means `flatRows` and
// `selectedRow` operate on the correct flat list everywhere.
const mergedResults = $derived<PaletteResults>(
  actions.length > 0 ? { ...results, actions } : results
);

// Derived: flattened result rows in display order — what arrow nav walks over.
const flatRows = $derived<ResultRow[]>(flattenResults(mergedResults));

function captureTrigger() {
  if (!browser) return;
  const active = document.activeElement;
  triggerEl = active instanceof HTMLElement ? active : null;
}

function restoreTrigger() {
  if (!triggerEl) return;
  try {
    triggerEl.focus({ preventScroll: true });
  } catch {
    /* element may have been removed from the DOM */
  }
  triggerEl = null;
}

function cancelInFlight() {
  if (inFlight) {
    inFlight.abort();
    inFlight = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

/** Inject the `kind` discriminator the server omits so row components stay type-safe. */
function mapResponse(res: ServerSearchResponse): PaletteResults {
  return {
    films: res.results.map((f) => ({ kind: "film" as const, ...f })),
    people: (res.people ?? []).map((p) => ({ kind: "person" as const, ...p })),
    cinemas: res.cinemas.map((c) => ({ kind: "cinema" as const, ...c })),
    // Screenings deliberately dropped — they were the only result type that
    // linked OUT to a cinema booking site. Search is internal-only now.
    festivals: res.festivals.map((f) => ({ kind: "festival" as const, ...f })),
    seasons: res.seasons.map((s) => ({ kind: "season" as const, ...s })),
  };
}

async function fetchServer(q: string, signal: AbortSignal): Promise<void> {
  isLoading = true;
  try {
    const res = await apiGet<ServerSearchResponse>(
      `/api/films/search?q=${encodeURIComponent(q)}`,
      { signal }
    );
    // Stale response — query has moved on. Drop silently.
    if (q !== query.trim()) return;
    results = mapResponse(res);
    selectedIndex = 0;
  } catch {
    // Aborted or failed: keep the current results.
  } finally {
    // Don't flip the loading flag if we were aborted (a newer fetch
    // owns the current state).
    if (!signal.aborted) isLoading = false;
  }
}

/**
 * Run a search for the current query. INSTANT when the in-browser catalog index
 * is ready (synchronous fuzzy search, zero network); otherwise warm the
 * one-time index load and use the debounced server search as a transient
 * fallback (covers the pre-ready window and the error case). No-op below
 * MIN_QUERY_LEN — empty/short queries clear results synchronously.
 */
function runSearch() {
  cancelInFlight();
  const q = query.trim();
  if (q.length < MIN_QUERY_LEN) {
    results = EMPTY_RESULTS;
    selectedIndex = 0;
    isLoading = false;
    return;
  }

  // Fast path — instant client-side fuzzy search.
  if (catalogIndex.status === "ready") {
    results = catalogIndex.search(q);
    selectedIndex = 0;
    isLoading = false;
    return;
  }

  // Index not ready — warm it once, then re-run if this is still the query.
  if (catalogIndex.status !== "error") {
    void catalogIndex.ensureLoaded().then(() => {
      if (open && query.trim() === q) runSearch();
    });
  }

  // Transient fallback while the index loads (or if it failed to): the existing
  // debounced server search. `mapResponse` drops screenings, so it stays internal-only.
  isLoading = true;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    inFlight = new AbortController();
    void fetchServer(q, inFlight.signal);
  }, SERVER_DEBOUNCE_MS);
}

/** Route for a navigable row. */
function pathFor(row: ResultRow): string | null {
  switch (row.kind) {
    case "film":
      return `/film/${row.id}`;
    case "person":
      return `/people/${encodeURIComponent(row.name)}`;
    case "cinema":
      return `/cinemas/${row.id}`;
    case "festival":
      return `/festivals/${row.slug}`;
    case "season":
      // No /seasons/[slug] route yet; navigate to the index page.
      return "/seasons";
    default:
      return null;
  }
}

/**
 * Activate a result row. Modes:
 *  - `open`   (default: Enter / click): close and navigate
 *  - `newTab` (Cmd+Enter / Ctrl+Enter): open in new tab; palette stays
 *  - `filter` (Alt+Enter): filter-action rows always apply the current
 *    intent; on a cinema row it narrows the calendar to that cinema.
 *    Other rows fall through to `open`.
 */
async function activate(row: ResultRow, mode: ActivationMode = "open"): Promise<void> {
  if (!browser) return;
  if (row.kind === "filter-action") {
    filters.applyIntent(parsed);
    closePalette();
    return;
  }
  if (row.kind === "cinema" && mode === "filter") {
    filters.cinemaIds = [row.id];
    closePalette();
    return;
  }
  const path = pathFor(row);
  if (!path) return;
  if (mode === "newTab") {
    window.open(path, "_blank", "noopener,noreferrer");
    return;
  }
  closePalette();
  await goto(path);
}

function closePalette() {
  if (!open) return;
  open = false;
  cancelInFlight();
  // Clear results so re-opening doesn't briefly show stale data.
  results = EMPTY_RESULTS;
  query = "";
  selectedIndex = 0;
  isLoading = false;
  restoreTrigger();
}

export const palette = {
  // --- reactive getters ---
  get open() {
    return open;
  },
  get query() {
    return query;
  },
  get parsed() {
    return parsed;
  },
  get selectedIndex() {
    return selectedIndex;
  },
  /** Server results merged with synthesised filter-action rows. */
  get results() {
    return mergedResults;
  },
  get flatRows() {
    return flatRows;
  },
  get selectedRow(): ResultRow | null {
    return flatRows[selectedIndex] ?? null;
  },
  get isLoading() {
    return isLoading;
  },

  // --- mutators ---
  setQuery(v: string) {
    query = v;
    selectedIndex = 0;
    if (open) runSearch();
  },
  setSelectedIndex(i: number) {
    // Clamp to valid range; empty list → 0
    const len = flatRows.length;
    if (len === 0) {
      selectedIndex = 0;
      return;
    }
    selectedIndex = Math.max(0, Math.min(i, len - 1));
  },
  selectNext() {
    this.setSelectedIndex(selectedIndex + 1);
  },
  selectPrevious() {
    this.setSelectedIndex(selectedIndex - 1);
  },
  selectFirst() {
    this.setSelectedIndex(0);
  },
  selectLast() {
    this.setSelectedIndex(flatRows.length - 1);
  },

  activate,
  activateSelected(mode: ActivationMode = "open") {
    const row = flatRows[selectedIndex];
    if (!row) return Promise.resolve();
    return activate(row, mode);
  },

  openPalette() {
    if (open) return;
    captureTrigger();
    open = true;
  },

  closePalette,

  toggle() {
    if (open) closePalette();
    else this.openPalette();
  },
};
