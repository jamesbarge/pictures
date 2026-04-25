# Fix poster/title mismatch on hydration when filter is persisted

**PR**: TBD
**Date**: 2026-04-25

## Symptom

Users with the **New** (or any other) filter persisted in `localStorage` from
a previous visit saw mismatched film posters on the desktop homepage grid.
For example:

| Slot | Title shown                                        | Poster image actually rendered |
|------|----------------------------------------------------|--------------------------------|
| 0    | It's Never Over, Jeff Buckley                      | Harakiri                       |
| 1    | One Battle After Another                           | Stop Making Sense              |
| 2    | Wolfwalkers                                        | 12 Angry Men                   |
| 3    | Hamnet                                             | Come and See                   |
| 4    | Cine-Real presents: North by Northwest             | Seven Samurai                  |

The titles, byline, runtime and screenings list were correct for the named
films. Only the `<img src>` was wrong — and consistently the SSR-rendered
"All" view's top films appeared in place of the "New" view's posters.

## Root cause

`frontend/src/lib/stores/filters.svelte.ts` initialised the persisted filter
fields (`cinemaIds`, `formats`, `programmingTypes`, `genres`, `decades`)
synchronously at module load:

```ts
const persisted = loadPersisted(); // {} on server, real data on client
let programmingTypes = $state(persisted.programmingTypes ?? []);
```

This produced a SSR/CSR hydration mismatch:

1. The server rendered with `programmingTypes = []` → Akira / Fight Club / etc. at the top of `hybridFilms`.
2. The client hydrated with `programmingTypes = ['new_release']` → Project Hail Mary / The Drama / etc.
3. Svelte 5's keyed `{#each films as { film, ... } (film.id)}` block correctly updated text content (titles, bylines) but failed to update `<img src>` / `<img srcset>` attributes when the keys at every position changed during hydration.

The text content updated reactively, the image attributes did not — so every
card displayed a poster from a different film than the one named.

## Fix

Defer the persisted-state load until after Svelte's hydration commit so the
initial client render matches the server render. Once that's true, the
keyed-`{#each}` block never has to reconcile a wholesale key change during
hydration; the persisted filter is applied via the same reactive path as a
user clicking the tab, which already worked correctly.

Implemented with a double `requestAnimationFrame` callback:

```ts
if (browser) {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const persisted = loadPersisted();
            if (persisted.cinemaIds?.length) cinemaIds = persisted.cinemaIds;
            // …
            hydrated = true;
        });
    });
}
```

`queueMicrotask` was tried first but fires too close to hydration and
re-triggers the same Svelte bug. Two RAFs guarantee we run after the first
paint, when reactivity has fully settled.

The persistence `$effect` is gated on the `hydrated` flag so we don't write
the SSR defaults back to `localStorage` before the persisted values have
been re-applied.

## Verification

- Manually reproduced the bug by setting `localStorage['pictures-filters'] = {programmingTypes: ['new_release']}` on prod (`pictures.london`) and reloading — observed Harakiri's poster under the Jeff Buckley title.
- Manually verified the fix on the dev server with the same `localStorage` setup — title/poster pairs now match.
- Added a Playwright regression test (`test-all.spec.ts`) that:
  1. Loads the page, clicks the New tab, captures title→poster pairs.
  2. Reloads the page with `programmingTypes: ['new_release']` persisted in `localStorage`.
  3. Polls the rendered cards until they equal the captured pairs (`expect.poll`).

## Impact

- All visitors with any non-default persisted filter (cinemaIds, formats,
  programmingTypes, genres, decades) — the bug affected every persisted
  filter field, but `programmingTypes` was by far the most visible because
  toggling it changes the entire top of the calendar.
- Brief (≤1 frame) "All" view flicker on first paint when a persisted
  filter is active. The user-visible content corruption is gone in
  exchange.

## Follow-up

The deeper Svelte 5 keyed-`{#each}` hydration bug — that `<img src>` /
`<img srcset>` attributes don't update when every key in an each-block
changes during hydration — remains. We've worked around it by ensuring
keys never change during hydration, but the underlying engine bug should
be reported upstream and a more architectural fix (e.g. cookie-backed
filter state read in `+page.server.ts`) considered if it recurs.
