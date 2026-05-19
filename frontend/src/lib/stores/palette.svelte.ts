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
import { parseQuery, type ParsedIntent } from "$lib/search/parse-query";
import {
  EMPTY_RESULTS,
  flattenResults,
  type PaletteResults,
  type ResultRow,
} from "$lib/search/result-types";

export type TriggerSource = "cmdk" | "click" | "route" | null;

let open = $state(false);
let query = $state("");
let selectedIndex = $state(0);
let triggerSource = $state<TriggerSource>(null);
let nowTick = $state(Date.now());
let results = $state<PaletteResults>(EMPTY_RESULTS);

// Plain (non-reactive) imperative state.
let triggerEl: HTMLElement | null = null;
let inFlight: AbortController | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;

// Derived: parse the query into structured intent every time it changes.
const parsed = $derived<ParsedIntent>(parseQuery(query, new Date(nowTick)));

// Derived: flattened result rows in display order — what arrow nav walks over.
const flatRows = $derived<ResultRow[]>(flattenResults(results));

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
  get results() {
    return results;
  },
  get flatRows() {
    return flatRows;
  },
  get selectedRow(): ResultRow | null {
    return flatRows[selectedIndex] ?? null;
  },

  // --- mutators ---
  setQuery(v: string) {
    query = v;
    selectedIndex = 0;
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

  openPalette(source: TriggerSource = "click") {
    if (open) return;
    captureTrigger();
    triggerSource = source;
    open = true;
  },

  closePalette() {
    if (!open) return;
    open = false;
    cancelInFlight();
    triggerSource = null;
    // Clear results so re-opening doesn't briefly show stale data.
    results = EMPTY_RESULTS;
    selectedIndex = 0;
    restoreTrigger();
  },

  toggle(source: TriggerSource = "cmdk") {
    if (open) this.closePalette();
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
