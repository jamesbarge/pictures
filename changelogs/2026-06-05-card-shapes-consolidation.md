# Card Components Consolidated onto card-shapes.ts

**PR**: TBD
**Date**: 2026-06-05

## Changes

- `FigmaFilmCard.svelte` and `FigmaTextDay.svelte` re-declared their own inline `Film`/`Screening` interfaces instead of importing `CardFilm`/`CardScreening` from `card-shapes.ts` — reintroducing the exact field-by-field drift that module's header comment says it was created to kill. Both now import the shared view-model types (their inline shapes were strict subsets, so no behavior change).
- The format-cleaning logic duplicated across both components (`distinctFormats` in the card, `fmt()` in the text day: filter `unknown`/`dcp`, underscore→space, uppercase) is extracted to one `formatLabel()` helper in `card-shapes.ts`.
- New `card-shapes.test.ts`: `formatLabel` no-signal/real-format cases + `toCardScreening` adaptation and null-cinema fallback.

## Verification

- svelte-check 0 errors; vitest 71/71 (4 new)
- Browser: poster mode (62 cards, format chips render) and text mode (315 rows, correct cell content) on the dev server

## Impact

- Single source of truth for card view-model shapes; future field additions happen in one place.

## Context

- Follow-up flagged by the five-agent PR review of #646 (type-design lens).
