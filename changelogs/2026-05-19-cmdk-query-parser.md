# cmd+k step 3 — Pure query parser + Vitest fixtures

**PR**: TBD
**Date**: 2026-05-19
**Branch**: `feat/cmdk-palette-step3-parser`

## Context

Step 3 of `tasks/cmdk-palette-plan.md`. Builds the structured-intent layer that sits between the user's typed query and the existing `filters.applyIntent()` / new `/api/films/search` filters. The parser is pure (no external deps, `now` injected) and produces `ParsedIntent` — what the palette UI will read to render chips and apply filters.

## Architecture

```
"horror tonight at curzon"
        │
        ▼
   parseQuery(input, now)              ← pure, ~610 LOC
        │
        ▼
   ParsedIntent {
     freeText: "at",                   ← unconsumed tokens
     genres: ["horror"],
     chainTokens: ["Curzon"],
     dateFrom: 2026-05-13T23:00Z,
     timeFrom: 18,
     chipDescriptors: [
       { id: "date:tonight", ... },
       { id: "genre:horror", ... },
       { id: "chain:Curzon", ... },
     ],
   }
```

`freeText` goes into the server tsvector/trigram match. `chipDescriptors` drive the visible chips inside the palette input (step 5). Filter fields feed `filters.applyIntent()` for the calendar mutate-behind-the-modal magic (step 8).

## What's included

| Vocab dictionary | Source of truth |
|---|---|
| `formats.ts` | `FORMAT_OPTIONS` in `$lib/constants/filters.ts` (35mm, 70mm, IMAX laser, Dolby, 4DX) |
| `genres.ts` | TMDB lowercase ("horror", "science fiction", "noir") + sci-fi/scifi aliases + "kids" → family |
| `decades.ts` | `DECADES` constant; "20s" defaults to 1920s (cinema convention) |
| `countries.ts` + `languages.ts` | TMDB country names ("france", "japan"); country wins over language for "french" |
| `chains.ts` | Curzon / Picturehouse / Everyman / BFI / Vue / Cineworld / Odeon + slug aliases PCC, ICA, BFI Southbank/IMAX |
| `certifications.ts` | BBFC: U, PG, 12, 12A, 15, 18, R18 |
| `specials.ts` | rep, subs, relaxed, premiere (+ premiereType), watchlist, seen, nearby |
| `time.ts` | TIME_PRESETS aligned with `$lib/constants/filters.ts` |

## Parser passes

1. **Multi-word phrases** (longest-match-first scan over the token list):
   - Dates: "this weekend", "next weekend", "this week", "next week", "next [monday..sunday]"
   - Times: "late night", "after Npm", "before Npm" (pair scan, not phrase scan)
   - Premieres: "world premiere", "uk premiere", "european premiere", "international premiere"
   - Watchlist: "want to see", "to watch", "to see"
   - Genres: "sci fi", "science fiction"
   - Formats: "70mm imax", "imax laser", "dolby atmos", "35 mm"
   - Cinema aliases: "prince charles", "bfi southbank", "bfi imax"

2. **Single-token dictionaries** in priority order: bare day names → time presets → hour literals → formats → genres → decades → countries (wins over languages) → languages → cinema chains → cinema slugs → certifications → specials

3. **Leftovers** become `freeText` (preserves original casing for downstream tsvector match)

## Date math

London-timezone aware via `Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London' })`. Matches the existing `filters.setDatePreset` pattern in `frontend/src/lib/stores/filters.svelte.ts:167`. DST is handled because we compute the offset per-instant from `Intl.DateTimeFormat` with `timeZoneName: 'shortOffset'`.

## Verification

- `npm test` (new) — 49 / 49 cases pass
- `npx svelte-check` — 0 errors (2 pre-existing warnings unchanged)
- Pure function: no `Date.now()`, no global state, no I/O. Vitest snapshots are deterministic across CI runs.

## Why no chrono-node

The user constraint is "no new paid services, prefer in-process FOSS". chrono-node is FOSS but ~80KB and overkill for our 4 temporal phrases. The hand-rolled parser is ~80 lines of date logic and stays well under our bundle budget. If we ever need full natural-language temporal parsing ("the second Thursday of next month"), we revisit.

## Next

Step 4: palette store (`palette.svelte.ts`) and global cmd+k binding. The store will own `query`, `parsed = $derived(parseQuery(query, new Date(nowTick)))`, results, selectedIndex.
