# film-title-cleaner: support regex non-film entries (parity with data-check)

**PR**: TBD
**Date**: 2026-05-19

## Changes

Extends `getKnownNonFilmType` in `src/scrapers/utils/film-title-cleaner.ts` to support **regex** entries in `knownNonFilmTitles`, not just exact-match. Closes a gap where data-check's `buildNonFilmMatchers` already supported both shapes (`scripts/data-check.ts:367`) but the scraper-time classifier could only do exact-match.

### What changed
- `KnownNonFilm` interface gained `regex?: boolean` and `pattern?: string` fields (mirrors the shape data-check expects).
- New exported helper `getKnownNonFilmTypeFromEntries(title, entries)` — pure matching function, testable without the learnings file.
- `getKnownNonFilmType(title)` now delegates to `getKnownNonFilmTypeFromEntries` after loading the learnings file. Same external API, expanded matching.
- 8 new vitest cases cover: empty/null entries, exact-match case-insensitivity, regex pattern matching, default `"event"` type fallback, `live_broadcast` and custom type preservation, exact-wins-over-regex ordering, silent skip on malformed regex, ignoring entries lacking both title and pattern.

### Behaviour

Before: scrapers could only auto-classify titles whose **exact** literal appeared in `knownNonFilmTitles`. Variable-format events ("Cafés philo anglais" vs "Cafe philo en français"; "NICKELFEST #1 - DAY ONE" vs "NICKELFEST #1 - DAY TWO") had to be enumerated as individual exact entries.

After: a single regex entry like `{ regex: true, pattern: "^caf[eé]s? philo", type: "event" }` covers the whole family. Data-check already supported this shape; the scraper now matches.

## Impact

- **Scraper-side classification consistency** — the patrol can now write a regex entry to learnings and the next scrape will apply it at write time, not just at patrol time. Closes the loop documented in `.claude/rules/scrapers.md`.
- **Fewer dirty rows at source** — pattern families like Cine Lumière's café-philo/baby-comptines programming (currently scraped as `content_type='film'`) will be classified correctly on next scrape after a single regex entry is added.
- **Pure function makes testing safer** — `getKnownNonFilmTypeFromEntries` can be invoked directly with controlled inputs; no file-system mocking needed.

## Testing
- `npx tsc --noEmit` clean
- `npx eslint` clean for new code
- `npm run test:run` — 1588 passed (was 1580, +8 new in this PR)
