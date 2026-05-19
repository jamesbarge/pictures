/**
 * Command palette store (cmd+k global search).
 *
 * Owns:
 *  - `open`            — boolean modal visibility
 *  - `query`           — raw input string
 *  - `parsed`          — derived ParsedIntent from parse-query.ts
 *  - `selectedIndex`   — flat index across all visible result rows
 *  - `triggerSource`   — what opened the palette (for analytics)
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
 * `nowTick` exists so date phrases like "tonight" stay accurate across
 * long idle sessions (the parser uses it as the `now` parameter). We
 * advance it once per minute — cheap and adequate.
 */

import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { apiGet, ApiError } from "$lib/api/client";
import { filters } from "$lib/stores/filters.svelte";
import { intentToActions } from "$lib/search/intent-to-actions";
import { parseQuery, type ParsedIntent } from "$lib/search/parse-query";
import {
  EMPTY_RESULTS,
  flattenResults,
  type CinemaResult,
  type FestivalResult,
  type FilmResult,
  type PaletteResults,
  type ResultRow,
  type ScreeningResult,
  type SeasonResult,
} from "$lib/search/result-types";

export type TriggerSource = "cmdk" | "click" | "route" | null;

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
  screenings: Omit<ScreeningResult, "kind">[];
  festivals: Omit<FestivalResult, "kind">[];
  seasons: Omit<SeasonResult, "kind">[];
}

let open = $state(false);
let query = $state("");
let selectedIndex = $state(0);
let triggerSource = $state<TriggerSource>(null);
let nowTick = $state(Date.now());
let results = $state<PaletteResults>(EMPTY_RESULTS);
let isLoading = $state(false);
let serverError = $state<string | null>(null);

// Plain (non-reactive) imperative state.
let triggerEl: HTMLElement | null = null;
let inFlight: AbortController | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;

// Derived: parse the query into structured intent every time it changes.
const parsed = $derived<ParsedIntent>(parseQuery(query, new Date(nowTick)));

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

// Start the per-minute tick when the module loads in the browser. Stop
// it explicitly — though in practice modules live for the whole page.
if (browser) {
  tickInterval = setInterval(() => {
    nowTick = Date.now();
  }, 60_000);
}

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
    cinemas: res.cinemas.map((c) => ({ kind: "cinema" as const, ...c })),
    screenings: res.screenings.map((s) => ({ kind: "screening" as const, ...s })),
    festivals: res.festivals.map((f) => ({ kind: "festival" as const, ...f })),
    seasons: res.seasons.map((s) => ({ kind: "season" as const, ...s })),
  };
}

async function fetchServer(q: string, signal: AbortSignal): Promise<void> {
  isLoading = true;
  serverError = null;
  try {
    const res = await apiGet<ServerSearchResponse>(
      `/api/films/search?q=${encodeURIComponent(q)}`,
      { signal }
    );
    // Stale response — query has moved on. Drop silently.
    if (q !== query.trim()) return;
    results = mapResponse(res);
    selectedIndex = 0;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    if (err instanceof ApiError) {
      serverError = `HTTP ${err.status}`;
    } else if (err instanceof Error && err.name === "AbortError") {
      // Some environments throw a generic Error with name=AbortError.
      return;
    } else {
      serverError = err instanceof Error ? err.message : "Search failed";
    }
  } finally {
    // Don't flip the loading flag if we were aborted (a newer fetch
    // owns the current state).
    if (!signal.aborted) isLoading = false;
  }
}

/**
 * Schedule a debounced server query. Always cancels any pending fetch.
 * No-op below MIN_QUERY_LEN — empty/short queries clear results
 * synchronously so the UI doesn't show stale data.
 */
function scheduleServerSearch() {
  cancelInFlight();
  const q = query.trim();
  if (q.length < MIN_QUERY_LEN) {
    results = EMPTY_RESULTS;
    selectedIndex = 0;
    isLoading = false;
    serverError = null;
    return;
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    inFlight = new AbortController();
    void fetchServer(q, inFlight.signal);
  }, SERVER_DEBOUNCE_MS);
}

function openInNewTab(path: string) {
  if (!browser) return;
  window.open(path, "_blank", "noopener,noreferrer");
}

/**
 * Activate a result row. Modes:
 *  - `open`   (default — Enter / click): navigate / book / re-query
 *  - `newTab` (Cmd+Enter / Ctrl+Enter):  open in new tab; palette stays
 *  - `filter` (Alt+Enter):               step 8 wires real filter apply.
 *                                        For step 7, falls through to `open`
 *                                        so the row is still actionable.
 */
async function activate(row: ResultRow, mode: ActivationMode = "open"): Promise<void> {
  if (!browser) return;

  // `filter` mode is intent-driven: filter-action rows always apply the
  // current intent. For entity rows (cinema/film), Alt+Enter narrows the
  // filter set to that single entity where it makes sense (cinema = "only
  // show screenings at this cinema").
  switch (row.kind) {
    case "filter-action": {
      filters.applyIntent(parsed);
      closePalette();
      return;
    }
    case "film": {
      const path = `/film/${row.id}`;
      if (mode === "newTab") {
        openInNewTab(path);
      } else {
        closePalette();
        await goto(path);
      }
      return;
    }
    case "cinema": {
      if (mode === "filter") {
        // Narrow the calendar filter to just this cinema and close.
        filters.cinemaIds = [row.id];
        closePalette();
        return;
      }
      const path = `/cinemas/${row.id}`;
      if (mode === "newTab") {
        openInNewTab(path);
      } else {
        closePalette();
        await goto(path);
      }
      return;
    }
    case "screening": {
      // Booking URLs are external; always open new tab regardless of mode.
      openInNewTab(row.bookingUrl);
      if (mode !== "newTab") closePalette();
      return;
    }
    case "festival": {
      const path = `/festivals/${row.slug}`;
      if (mode === "newTab") {
        openInNewTab(path);
      } else {
        closePalette();
        await goto(path);
      }
      return;
    }
    case "season": {
      // No /seasons/[slug] route yet; navigate to the index page.
      const path = `/seasons`;
      if (mode === "newTab") {
        openInNewTab(path);
      } else {
        closePalette();
        await goto(path);
      }
      return;
    }
    case "user-status": {
      const path = `/film/${row.filmId}`;
      if (mode === "newTab") {
        openInNewTab(path);
      } else {
        closePalette();
        await goto(path);
      }
      return;
    }
    case "recent": {
      // Don't navigate — re-run the saved query in place.
      setQueryInternal(row.query);
      return;
    }
  }
}

/** Internal mutator used by activate() to avoid `this` binding gymnastics. */
function setQueryInternal(v: string) {
  query = v;
  selectedIndex = 0;
  if (open) scheduleServerSearch();
}

function closePalette() {
  if (!open) return;
  open = false;
  cancelInFlight();
  triggerSource = null;
  // Clear results so re-opening doesn't briefly show stale data.
  results = EMPTY_RESULTS;
  query = "";
  selectedIndex = 0;
  isLoading = false;
  serverError = null;
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
  get triggerSource() {
    return triggerSource;
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
  get serverError() {
    return serverError;
  },

  // --- mutators ---
  setQuery(v: string) {
    setQueryInternal(v);
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
  setResults(next: PaletteResults) {
    results = next;
    // Reset selection when the result set changes to avoid pointing
    // at a row that no longer exists.
    selectedIndex = 0;
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

  openPalette(source: TriggerSource = "click") {
    if (open) return;
    captureTrigger();
    triggerSource = source;
    open = true;
  },

  closePalette,

  toggle(source: TriggerSource = "cmdk") {
    if (open) closePalette();
    else this.openPalette(source);
  },

  // Test/utility — manually advance the now-tick (for Vitest)
  _setNowTick(t: number) {
    nowTick = t;
  },
};

// Cleanup hook for hot-reload / test environments. Not exposed publicly.
export function _disposePaletteStore() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  cancelInFlight();
}
