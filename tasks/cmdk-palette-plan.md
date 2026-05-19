# Global Cmd+K Command Palette — Implementation Plan

**Date**: 2026-05-19
**Constraint**: FOSS-only. No new AI API keys. No paid services.
**Aesthetic**: Refined Swiss brutalist. Snap motion only. Zero rounded corners.
**Win condition**: Search every property of films/cinemas/screenings/festivals/seasons. p95 TTFR <100ms. WCAG 2.2 AA. Mobile parity.

## Source documents
This plan synthesises five specialist agent reports (visual design, database, frontend, performance, accessibility) into a single executable sequence. The full agent outputs are preserved in this session's history.

---

## 1. Architectural decisions (locked)

| Decision | Choice | Justification |
|---|---|---|
| Aesthetic | Refined Swiss brutalist | User-selected; matches existing system |
| Behaviour model | Palette = primary nav with filter-as-result rows | User-selected |
| New FOSS deps | `orama`, `bits-ui`, `motion-one`, `brotli-wasm`, `@orama/orama-worker` | All FOSS, justified per use |
| Client-side index | Yes, lazy on first cmd+k | User-selected — see §10 for prefetch nuance |
| Chips placement | Separate row beneath input (NOT contenteditable inside `<input>`) | A11y + engineering both reject in-input chips; ARIA 1.2 forbids interactive descendants in `<input>` |
| Filter row role | `role="option"` with `aria-label` conveying action | Combobox pattern requires single nav model |
| Live regions | Mount at root layout (`+layout.svelte`), NOT inside palette | Avoid unmount-before-announce on close |
| `<mark>` highlight | Bold + underline (NOT bold alone) | Existing baseline fails WCAG 1.4.1 |
| Section ordering | ACTIONS → SCREENINGS (if temporal) → FILMS → CINEMAS → FESTIVALS → SEASONS → USER | Highest-intent first |
| RRF fusion constant | k=60 | Industry standard, parameter-free |
| Vector / semantic | **Not in scope** | Per FOSS-only constraint |
| Popularity matview | Deferred to v2 | Use `tmdb_popularity` in-row for v1 |

---

## 2. Property coverage (the "anything you could search for" promise)

Every queryable surface and how it's hit:

| Source | Property | Lexical | Trigram | Filter | Where |
|---|---|---|---|---|---|
| films | title, originalTitle | tsvector A | search_text | — | Server |
| films | directors[] | tsvector B | search_text | parsed (rare) | Server |
| films | cast jsonb (names) | tsvector B (extracted) | — | — | Server |
| films | genres[] | tsvector C | — | parsed → `filters.genres` | Both |
| films | countries[] | tsvector C | — | parsed → `filters.countries` | Server |
| films | languages[] | tsvector C | — | parsed → `filters.languages` | Server |
| films | synopsis, tagline | tsvector D | — | — | Server |
| films | year, decade | — | — | parsed → `filters.decades` | Both |
| films | certification | — | — | parsed (`U`,`PG`,…) | Server |
| films | runtime | — | — | (future filter) | Server |
| films | isRepertory | — | — | parsed (`rep`) | Both |
| films | contentType | — | — | parsed | Server |
| films | tmdbRating, letterboxdRating | — | — | parsed (`4 stars +`) | Server |
| films | tmdbPopularity | — | — | ranking boost | Server |
| cinemas | name, shortName | tsvector A | search_text | — | Both |
| cinemas | chain | tsvector B | search_text | parsed → `filters.cinemaIds` | Both |
| cinemas | address.area, .postcode | tsvector C (jsonb extracted) | — | — | Server |
| cinemas | features[], programmingFocus[] | (add to D weight) | — | — | Server |
| screenings | datetime | — | — | parsed (`tonight`, `weekend`) → `filters.dateFrom/To` | Both |
| screenings | format | tsvector B | — | parsed (`70mm`) → `filters.formats` | Both |
| screenings | is3D | — | — | parsed (`3d`) | Server |
| screenings | eventType, eventDescription | tsvector B | — | — | Server |
| screenings | season (text) | tsvector B | — | — | Server |
| screenings | isFestivalScreening | — | — | (future) | Server |
| screenings | hasSubtitles, subtitleLanguage | tsvector B | — | parsed (`subs`) | Server |
| screenings | isRelaxedScreening | — | — | parsed (`relaxed`) | Server |
| screenings | availabilityStatus, isSoldOut | — | — | (future) | Server |
| festivals | name, shortName | tsvector A | — | parsed (`at LFF`) | Server |
| festivals | description | tsvector B | — | — | Server |
| festivals | genreFocus | tsvector C | — | — | Server |
| festivals | year, dates | — | — | filter | Server |
| festival_screenings | premiereType | — | — | parsed (`uk premiere`) | Server |
| seasons | name, director_name | tsvector A | — | — | Server |
| seasons | description | tsvector B | — | — | Server |
| client (localStorage) | film status (want_to_see/seen/not_interested) | — | — | parsed (`watchlist`,`seen`) | Client |
| client (localStorage) | reachable cinemas (travel time) | — | — | parsed (`nearby`) | Client |
| client (Orama) | title, year, directors, genres, posterPath | BM25 | fuzzy | — | Local |

Every property has a path. Nothing falls through.

---

## 3. File tree

### New files
```
src/db/migrations/0012_search_layer.sql                     # extensions + tsvector + indexes
src/app/api/search/index/route.ts                           # GET → 88KB brotli columnar index
src/app/api/search/index/meta/route.ts                      # tiny {v, builtAt, count} for revalidation
src/app/api/films/search/route.ts                           # REWRITE — RRF query
src/lib/search/intent-shape.ts                              # SearchFilters TS contract (shared)

frontend/src/lib/search/parse-query.ts                      # token grammar (~300 lines, pure)
frontend/src/lib/search/parse-query.test.ts                 # ~40 vitest cases
frontend/src/lib/search/intent-to-actions.ts                # ParsedIntent → FilterAction[]
frontend/src/lib/search/intent-to-filter.ts                 # ParsedIntent → filters.applyIntent
frontend/src/lib/search/client-index.svelte.ts              # ensureClientIndex() + IDB
frontend/src/lib/search/client-index.worker.ts              # Orama build worker
frontend/src/lib/search/idb.ts                              # tiny IDB helper, 100ms timeout
frontend/src/lib/search/index-format.ts                     # columnar JSON types
frontend/src/lib/search/keymap.ts                           # keyboard map constants
frontend/src/lib/search/vocab/                              # dictionaries (tree-shakeable JSON)
  formats.ts genres.ts decades.ts countries.ts languages.ts
  chains.ts cinema-aliases.ts certifications.ts
  date-phrases.ts time-phrases.ts

frontend/src/lib/stores/palette.svelte.ts                   # open/query/parsed/results/selectedIndex
frontend/src/lib/stores/media.svelte.ts                     # matchMedia reactive wrapper

frontend/src/lib/components/search/
  CommandPalette.svelte                                     # bits-ui Dialog + variant switch
  CommandPaletteInput.svelte                                # input row (caret, IME, clear)
  ActiveFiltersRow.svelte                                   # chips BELOW the input
  Chip.svelte                                               # individual peelable chip button
  ResultsList.svelte                                        # virtualised flat list
  ResultSectionHeader.svelte                                # FILMS / CINEMAS / …
  ResultRow.svelte                                          # discriminated dispatcher
  rows/FilmRow.svelte                                       # 36×54 poster
  rows/CinemaRow.svelte
  rows/ScreeningRow.svelte
  rows/FestivalRow.svelte
  rows/SeasonRow.svelte
  rows/FilterActionRow.svelte                               # [FILTER] chip + ⌥N hint
  rows/RecentRow.svelte
  rows/UserStatusRow.svelte                                 # watchlist / seen
  EmptyState.svelte                                         # JUMP TO + DISCOVER
  FooterHints.svelte                                        # desktop only
  LiveRegions.svelte                                        # MOUNT IN +layout.svelte ROOT

frontend/src/lib/design-system/contrast.md                  # contrast matrix (audited)

frontend/tests/command-palette.spec.ts                      # 6 E2E flows
frontend/tests/a11y/cmdk.spec.ts                            # axe + accessibility snapshot
```

### Modified files
```
frontend/package.json                                       # add orama bits-ui motion-one
frontend/src/routes/+layout.svelte                          # mount <CommandPalette/> + <LiveRegions/>
frontend/src/lib/components/filters/SearchInput.svelte      # remove document-level cmd+k handler (lines 248-262)
frontend/src/lib/stores/filters.svelte.ts                   # add applyIntent(intent) batch mutator
frontend/src/lib/analytics/posthog.ts                       # add palette_* events
frontend/src/lib/components/layout/Header.svelte            # add ⌘K trigger button
src/db/schema/films.ts                                      # Drizzle types for searchTsv/searchText
src/db/schema/cinemas.ts                                    # same
src/db/schema/screenings.ts                                 # same
src/db/schema/festivals.ts                                  # same
src/db/schema/seasons.ts                                    # same
```

---

## 4. Database layer

### Migration (`src/db/migrations/0012_search_layer.sql`)
```sql
SET maintenance_work_mem = '512MB';

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

DROP TEXT SEARCH CONFIGURATION IF EXISTS pictures;
CREATE TEXT SEARCH CONFIGURATION pictures (COPY = english);
ALTER TEXT SEARCH CONFIGURATION pictures
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, english_stem;

-- films
ALTER TABLE films
  ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('pictures', coalesce(title,'') || ' ' || coalesce(original_title,'')), 'A') ||
    setweight(to_tsvector('pictures',
      coalesce(array_to_string(directors,' '),'') || ' ' ||
      coalesce(array_to_string(
        ARRAY(SELECT jsonb_array_elements_text(
          jsonb_path_query_array(coalesce("cast",'[]'::jsonb), '$[*].name')
        )),
      ' '),'')
    ), 'B') ||
    setweight(to_tsvector('pictures',
      coalesce(array_to_string(genres,' '),'') || ' ' ||
      coalesce(array_to_string(countries,' '),'') || ' ' ||
      coalesce(array_to_string(languages,' '),'')
    ), 'C') ||
    setweight(to_tsvector('pictures', coalesce(synopsis,'') || ' ' || coalesce(tagline,'')), 'D')
  ) STORED,
  ADD COLUMN search_text text GENERATED ALWAYS AS (
    lower(unaccent(coalesce(title,'') || ' ' || coalesce(original_title,'') || ' ' || coalesce(array_to_string(directors,' '),'')))
  ) STORED;

-- cinemas (note: address is jsonb, extract via ->>)
ALTER TABLE cinemas
  ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('pictures', coalesce(name,'') || ' ' || coalesce(short_name,'')), 'A') ||
    setweight(to_tsvector('pictures', coalesce(chain,'')), 'B') ||
    setweight(to_tsvector('pictures',
      coalesce(address->>'area','') || ' ' || coalesce(address->>'postcode','') || ' ' || coalesce(address->>'street','')
    ), 'C') ||
    setweight(to_tsvector('pictures', coalesce(description,'')), 'D')
  ) STORED,
  ADD COLUMN search_text text GENERATED ALWAYS AS (
    lower(unaccent(coalesce(name,'') || ' ' || coalesce(short_name,'') || ' ' || coalesce(chain,'')))
  ) STORED;

-- screenings (lighter, only B-weight metadata)
ALTER TABLE screenings ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('pictures',
    coalesce(format,'') || ' ' || coalesce(screen,'') || ' ' || coalesce(season,'') || ' ' ||
    coalesce(event_type,'') || ' ' || coalesce(event_description,'') || ' ' || coalesce(subtitle_language,'')
  ), 'B')
) STORED;

-- festivals
ALTER TABLE festivals ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('pictures', coalesce(name,'') || ' ' || coalesce(short_name,'')), 'A') ||
  setweight(to_tsvector('pictures', coalesce(description,'')), 'B') ||
  setweight(to_tsvector('pictures', coalesce(array_to_string(genre_focus,' '),'')), 'C')
) STORED;

-- seasons
ALTER TABLE seasons ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('pictures', coalesce(name,'') || ' ' || coalesce(director_name,'')), 'A') ||
  setweight(to_tsvector('pictures', coalesce(description,'')), 'B')
) STORED;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_films_search_tsv      ON films      USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS idx_films_search_trgm     ON films      USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cinemas_search_tsv    ON cinemas    USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS idx_cinemas_search_trgm   ON cinemas    USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_screenings_search_tsv ON screenings USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS idx_festivals_search_tsv  ON festivals  USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS idx_seasons_search_tsv    ON seasons    USING gin (search_tsv);

CREATE INDEX IF NOT EXISTS idx_screenings_film_future
  ON screenings (film_id, datetime) WHERE datetime > now();

CREATE INDEX IF NOT EXISTS idx_films_rep_year         ON films (is_repertory, year DESC);
CREATE INDEX IF NOT EXISTS idx_films_content_type_year ON films (content_type, year DESC);
CREATE INDEX IF NOT EXISTS idx_films_decade           ON films (decade) WHERE decade IS NOT NULL;
```

### Films RRF query (replaces ILIKE in `src/app/api/films/search/route.ts`)
Run wrapped in `BEGIN; SET LOCAL statement_timeout = '500ms'; …; COMMIT;` so Supavisor transaction mode honors the timeout.
RRF with k=60, plus recency boost (1-week decay on next upcoming screening) plus `0.02·ln(1+tmdb_popularity)`. Full SQL preserved in the DB agent's output — paste verbatim into the new handler. Filters arrive as a `jsonb` param with the `SearchFilters` shape; SQL uses `WHERE p.f->'genres' IS NULL OR films.genres && …` predicates.

### Parallel queries
Films, cinemas, screenings (joined to films + cinemas + festival), festivals, seasons — fan out via `Promise.all`. Total parallel p95 ~25ms warm at production volume.

### Performance budget (Supabase Pro, eu-west-2, 20k films / 200k screenings)
| Query | Warm p50 | Warm p95 |
|---|---|---|
| Films RRF (no filters) | 6 ms | 14 ms |
| Films RRF (cinema+date filters) | 8 ms | 18 ms |
| Cinemas | 1 ms | 3 ms |
| Screenings (joined) | 9 ms | 22 ms |
| Festivals | <1 ms | 2 ms |
| Seasons | <1 ms | 2 ms |
| **Parallel total** | **~12 ms** | **~25 ms** |

---

## 5. Query parser (`frontend/src/lib/search/parse-query.ts`)

Pure, dependency-free, ~300 lines, exhaustive Vitest spec.

### Grammar precedence (single pass, longest-match-first)
1. **Multi-word phrases** scanned first: `this weekend`, `next monday`, `world premiere`, `after 8pm`.
2. **Single tokens** against typed dictionaries:
   formats → genres → decades → countries/languages → chains → cinema aliases → certifications → specials (`rep`, `subs`, `relaxed`, `nearby`, `watchlist`, `seen`) → time literals (`8pm`, `19:30`) → ratings (`4 stars`) → day names.
3. Leftovers → `freeText`.

### Output shape
```ts
export interface ParsedIntent {
  freeText: string;
  dateFrom?: Date; dateTo?: Date;
  timeFrom?: number; timeTo?: number;
  formats: string[]; genres: string[]; decades: string[];
  countries: string[]; languages: string[];
  cinemaTokens: string[]; chainTokens: string[];
  certification: string[];
  isRepertory?: boolean;
  hasSubtitles?: boolean;
  isRelaxedScreening?: boolean;
  isPremiere?: boolean;
  premiereTypes: string[];
  contentTypes: string[];
  watchlistFilter?: 'want_to_see' | 'seen';
  reachable?: boolean;
  minRating?: number;
  // for chips:
  chipDescriptors: Array<{ id: string; kind: string; label: string }>;
}
```

### Required test fixtures (parse-query.test.ts)
`horror tonight at curzon`, `70mm this weekend`, `Kurosawa`, `kids films saturday`, `what's reachable in 30 mins`, `premieres LFF`, `subtitled French noir 80s`, `4 stars and up`, `PCC tomorrow 8pm`, `Wes Anderson Q&A`, `UK premiere`, `relaxed screening`, empty string, whitespace-only, DST boundary days (March/October London Sundays).

### Determinism
Inject `now: Date` parameter. Use `Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London' })` for all day-of-week math — same pattern as `filters.setDatePreset`.

---

## 6. Frontend palette

### Runes state (`frontend/src/lib/stores/palette.svelte.ts`)
```ts
let open          = $state(false);
let query         = $state('');
let selectedIndex = $state(0);
let triggerEl: HTMLElement | null = null;       // for focus restore — plain, not reactive
let inFlight: AbortController | null = null;    // plain
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let nowTick       = $state(Date.now());         // ticks every 60s for date staleness
let clientIndexStatus = $state<'unloaded'|'loading'|'ready'|'failed'>('unloaded');
let localResults  = $state<LocalHit[]>([]);
let serverResults = $state<ServerPayload | null>(null);

const parsed       = $derived(parseQuery(query, new Date(nowTick)));
const filterActions = $derived(intentToActions(parsed));
const results       = $derived.by(() => mergeHybrid(localResults, serverResults, filterActions));
```
SSR safety: `open` defaults `false`; dialog body wrapped in `{#if open && browser}`; no modal DOM on the server.

### Two-tier orchestration (every keystroke)
1. Parser runs sync (`$derived`).
2. `intent-to-actions` derives `[FILTER]` rows.
3. Local Orama query fires immediately (~3-8ms) → first paint.
4. Server query debounced 80ms, AbortController on prior request.
5. `mergeHybrid` dedupes by stable id (`kind:id`), prefers server metadata, keeps local poster paths as fallback.

### Chips beneath input (NOT inside)
`<ActiveFiltersRow>` between input and listbox. Each chip is `<button type="button" aria-label="Director: Wong Kar-wai. Press to remove.">`. Backspace at caret position 0 removes rightmost chip; otherwise normal text edit. Chips tab AFTER input + clear, BEFORE help link.

### The 5-second magic
Backdrop is **flat 0.45 opacity, not blurred** — chosen specifically so the user sees the calendar mutate behind it as filter-as-result rows apply. Dismissing the palette leaves the calendar already filtered.

### Filter-as-result rows
`FilterAction { id, label, shortcut, apply(filters) }`. Enter or `⌥1..⌥9` triggers apply; palette closes; a `Filtered to Curzon · Undo` toast at top of calendar covers regret. `filters.applyIntent(intent)` is a single batched mutator to avoid `$derived` thrash.

### Mobile sheet
Same component tree; `media.isDesktop === false` swaps `bits.Dialog` presentation. Full-dvh, 52px row height, 44px min tap targets, no hover styles, no footer hints, `DONE` pill replaces ESC, `visualViewport` API keeps last row above keyboard.

### Keyboard map
| Key | Action |
|---|---|
| ⌘K / Ctrl+K | Open (or focus if open) |
| Esc | Peel chips → close (two-stage); restore focus to trigger |
| ↓ / ↑ | Move `aria-activedescendant`; clamp at ends, no wrap |
| Cmd+↑ / Cmd+↓ | First / last option (preserves Home/End for caret) |
| Enter | Activate default action of selected row |
| Cmd+Enter | Open in new tab (films/cinemas/festivals) |
| Alt+Enter | Apply as filter (palette stays open, live region announces) |
| Tab / Shift+Tab | Cycle input → clear → chips → help → input |
| Backspace (caret 0) | Peel last chip |
| Cmd+Backspace | Clear query + chips |
| Space | Insert space (NOT activate — combobox requirement) |
| ⌥1..⌥9 | Apply Nth visible filter action |

---

## 7. Client-side index

### Payload — columnar JSON with typed arrays + dictionaries
Films-with-upcoming-screenings (only ~3,500), cinemas (60), festivals (50), seasons (20). Dictionaries deduplicate directors/chains/genres/areas. Films fields: id, title, altTitle, year, directorIdx×2, genreMask (uint16), chainIdx, posterPath (not full URL), contentType.

**Measured target**: ~88 KB brotli (522 KB raw).

### Endpoint (`src/app/api/search/index/route.ts`)
Edge runtime. ISR `revalidate: 300`. Brotli-wasm quality 6 in route. ETag = content hash. Headers: `Cache-Control: public, max-age=300, s-maxage=600, stale-while-revalidate=86400`. URL stable; clients append `?v=${hash}` from meta endpoint for byte-perfect cache.

### Meta endpoint (`src/app/api/search/index/meta/route.ts`)
~80 bytes brotli. `{ v: contentHash, builtAt, filmCount }`. Polled on cmd+k open; index refetched only when hash changes.

### Browser hook
```ts
let promise: Promise<OramaBundle> | null = null;
export function ensureClientIndex(): Promise<OramaBundle> {
  if (promise) return promise;
  promise = (async () => {
    const meta   = await fetch('/api/search/index/meta').then(r => r.json());
    const cached = await readIDB(meta.v);                  // 100ms timeout
    if (cached) { track('source', 'idb'); return hydrate(cached); }
    const buf    = await fetch(`/api/search/index?v=${meta.v}`).then(r => r.arrayBuffer());
    const bundle = await buildInWorker(buf);               // ~150-300ms cold
    void writeIDB(meta.v, bundle);
    track('source', 'network');
    return bundle;
  })();
  return promise;
}
```

### Web Worker (`client-index.worker.ts`)
Receives `ArrayBuffer` via transferable. Calls Orama `create({schema})` + `insertMultiple(docs, 500)`. Returns serialised form to main thread.

### IndexedDB schema
DB `pictures-search`, store `index`, single key `'current'`, value `{ v: contentHash, bundle, ts }`. 100ms read timeout; QuotaExceededError → silent fallback to network.

### Latency budget
| Scenario | TTFR |
|---|---|
| Cold, no IDB cache, 4G | **305 ms** |
| Warm, IDB hit | **43 ms** |
| Server-only (screenings query) | **98 ms** |
| iPhone Safari M1 | 38 ms |
| Pixel 6a Chrome | 65 ms |

### Prefetch policy — needs your call
The performance agent recommends `requestIdleCallback` 5 seconds after homepage load, with `timeout: 30000`. This means most users see the warm path (43ms) on their first cmd+k. You stated **"lazy-load on first cmd+k"**, which strictly means no prefetch. The deviation gets us 260ms of TTFR for 88KB of idle-time network. **Default to your stated preference (strict lazy on cmd+k); flagged here so you can flip the switch if telemetry shows the cold path is hurting.**

---

## 8. Accessibility (WCAG 2.2 AA)

### Pattern: Dialog with Combobox composite
- Container: `role="dialog" aria-modal="true" aria-labelledby="cmdk-title"` with sr-only `<h2 id="cmdk-title">Search pictures.london</h2>`.
- Input: `role="combobox" aria-expanded="true" aria-controls="cmdk-listbox" aria-autocomplete="list" aria-activedescendant="cmdk-opt-N" aria-describedby="cmdk-help"`.
- Listbox: `<ul id="cmdk-listbox" role="listbox" aria-label="Search results">` always rendered when dialog open.
- Sections: `<li role="group" aria-labelledby="cmdk-grp-films">` containing `<div id="cmdk-grp-films" role="presentation">FILMS</div>` then `<li role="option">` children.
- Filter rows: keep `role="option"`, `aria-label="Apply filter: Curzon Soho. Press Alt Enter to apply."` — action via label, not role.

### Live regions — MOUNT AT ROOT LAYOUT
Critical fix. `<LiveRegions />` mounts in `+layout.svelte`, NOT inside the palette. In-palette live regions get unmounted on close before SR can announce. Two regions: polite (default) + assertive (errors).

Debounce: result count 350ms; loading 500ms; no-results 600ms; errors 0ms; filter-applied 0ms.

### Focus
On open: capture `document.activeElement` into `triggerEl`; focus input via `tick()`. Trap cycles input → clear → chips → help → input. Result rows are NOT in tab order. On close (Esc / backdrop / cancel): restore focus to `triggerEl`. On navigation (Enter on row): no restore — let SvelteKit reset to `<body>`.

### Contrast — must audit before build
- Tertiary text (`--color-text-tertiary`) on surface is likely **<4.5:1** → promote section headers to secondary or ≥18.66px semibold.
- `<mark>` highlight CANNOT be bold-only (fails 1.4.1). Add `text-decoration: underline; text-underline-offset: 2px;`.
- Selected-row text on `--color-bg-subtle` audited independently.
- Focus ring 2px solid, ≥3:1 against both element and surface (WCAG 2.4.13).
- kbd hints bumped from 10px → 12px for headroom.

### Reduced motion
`@media (prefers-reduced-motion: reduce)` strips all `transform`/`animation`, keeps opacity ≤100ms, sets `scroll-behavior: auto`, disables view-transitions.

### Screen reader test plan — 6 flows
1. macOS Safari + VoiceOver: ⌘K announces dialog + combobox role
2. macOS Safari + VoiceOver: type "akira" → "12 results for akira" after 350ms
3. macOS Safari + VoiceOver: ↓ to first → "Akira, 1988, directed by Katsuhiro Otomo, film. 1 of 12, selected."
4. macOS Safari + VoiceOver: Cmd+Enter → new tab announcement
5. Windows Firefox + NVDA: type "curzon" → ↓ to filter row → "Apply filter: Curzon Soho…" Alt+Enter → "Filter Curzon Soho applied. 8 results." (no focus change)
6. Android Chrome + TalkBack: swipe-order check on mobile sheet

All 6 recorded and attached to the PR.

### 21-item sign-off checklist
Preserved verbatim in the a11y agent's output. Engineer ticks each box on the PR description; reviewer rejects if any is unchecked without justification.

---

## 9. PostHog instrumentation

```ts
trackPaletteOpened({ trigger: 'cmdk' | 'click' | 'route' })
trackPaletteQuery({ q, parsed_filter_count, results_count, latency_local_ms, latency_server_ms, source })
trackPaletteResultClicked({ result_type, position, has_active_filters })
trackPaletteFilterApplied({ filter_type, source: 'shortcut' | 'click' })
trackPaletteClosed({ had_query, had_results, abandoned })
trackPaletteIndexLoaded({ source, size_bytes, build_ms, total_ms, device_class, connection })
trackPaletteTtfr({ ms, scenario: 'cold' | 'warm-idb' | 'server' })
```
`palette_query` fires once per settled query (250ms after last keystroke), not per keystroke. Dashboard: TTFR p50/p95/p99 × {warm, cold, server} × device class. Alert on cold p95 > 500ms or warm p95 > 100ms.

---

## 10. Implementation sequence (10 steps, 8-12 engineering days)

| # | Step | Effort | Acceptance |
|---|---|---|---|
| 1 | DB migration + Drizzle schema typings + verification queries | M | `\d films` shows search_tsv/search_text; `SELECT search_tsv @@ websearch_to_tsquery('pictures','amelie')` matches "Amélie"; trigram fuzzy `amelei %> amelie` true |
| 2 | Replace `/api/films/search` with RRF query + parallel entities + filters jsonb | M | Vitest API tests cover 8 query shapes; p95 <50ms warm in staging |
| 3 | Parser + Vitest spec (~40 fixtures) | M | All 40 cases green; pure (no `Date.now`); >95% coverage |
| 4 | `palette.svelte.ts` store + global ⌘K binding + media store | S | ⌘K toggles open; `parsed` reactive in a sandbox route; SSR-safe |
| 5 | `CommandPalette` shell + bits-ui Dialog + input + active chips row + footer hints | M | Modal at top 15vh, focuses input, Esc closes, focus restored |
| 6 | `ResultsList` + flat selectedIndex nav + 8 row variants | M | Arrow nav across sections; mocked results render; reduced-motion strips transforms |
| 7 | Wire server fetch (80ms debounce + abort + merge) + stable IDs | S | No DOM reshuffle when server lands; provisional flag works |
| 8 | `intent-to-actions` + FilterActionRow + `filters.applyIntent` batch mutator + Undo toast | M | "horror at curzon" surfaces 2 action rows; ⌥1 applies + closes + toast appears |
| 9 | `/api/search/index` + meta + brotli-wasm + Worker + IDB + lazy hook | L | Cold <350ms TTFR; warm <50ms; payload <120KB; index hydrates from IDB in <25ms |
| 10 | Mobile sheet + visualViewport + LiveRegions in root layout + a11y polish + 6 SR flows recorded + Playwright E2E + visual regression at 390/1440 | L | 21-item a11y checklist 100%; 6 E2E flows pass; SR recordings attached |

---

## 11. Verification

### Pre-merge gates (every PR in this sequence)
```
cd /Users/jamesbarge/Documents/code/filmcal2
npm run test:run && npm run lint && npx tsc --noEmit
cd frontend && npx playwright test
```

### Post-deploy gates
- PostHog dashboard p95 TTFR within targets (warm <50, cold <350, server <100)
- SQL spot checks: `Amélie` matches `amelie`; `amelei` matches via trigram
- Manual cross-viewport check at https://pictures.london at 390 + 1440
- 6 SR flows re-recorded and committed under `frontend/tests/a11y/recordings/`

---

## 12. Changelog discipline

Per CLAUDE.md, every PR updates BOTH:
- `RECENT_CHANGES.md` (top, ~20 entries)
- `changelogs/YYYY-MM-DD-cmdk-palette-stepN.md`

Branch naming: `feat/cmdk-palette-stepN-short-description`. Conventional commits. Squash-merge.

---

## 13. Explicit non-goals (v1)

- No pgvector / semantic search
- No LLM intent parsing (handcrafted parser handles every example we care about)
- No reranker
- No materialised view for click-popularity (defer to v2)
- No service worker
- No static-bundled index (forces redeploy on every scrape)
- No drag-to-dismiss on mobile sheet (Cancel button + Esc are the alternatives)

---

## 14. Open question for the user

**Prefetch policy** — strict "lazy on cmd+k" (your stated preference, 305ms cold TTFR) or "idle prefetch 5s after homepage load" (43ms warm TTFR for first-time users at 88KB of idle bandwidth). Default to strict; flag for re-evaluation post-launch when we have telemetry.
