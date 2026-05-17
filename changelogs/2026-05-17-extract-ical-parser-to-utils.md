# Extract iCal parser to scrapers/utils

**PR**: TBD
**Date**: 2026-05-17

## Context

The Cinema Museum scraper (shipped via #500) included a minimal in-tree iCal parser (`parseVEvents`). Code review in #496 flagged it as a candidate for extraction to `src/scrapers/utils/` if a second iCal-feed venue arrived. Rather than wait, this pre-extracts the parser so any future iCal-based London venue can drop in with one import.

## Changes

### `src/scrapers/utils/ical-parser.ts` (new)

- Moves `parseVEvents` and the `ParsedVEvent` interface verbatim from `cinemas/cinema-museum.ts`.
- Adds an expanded docstring covering scope (RFC 5545 line folding + TEXT escapes + UK-local DTSTART) and explicit non-goals (UTC `Z` form, floating times, RRULE expansion).
- The `unescapeIcalText` helper moves with it.

### `src/scrapers/cinemas/cinema-museum.ts`

- Imports `parseVEvents` from the new utils module.
- Re-exports `parseVEvents` from the original location so the existing test file (`cinema-museum.test.ts` imports `parseVEvents` from `./cinema-museum`) keeps working without modification.

## Verification

- `npm run test:run` — 990/990 pass on the branch
- `npx tsc --noEmit` — clean
- No production behaviour change — pure file move + re-export

## Impact

- Future iCal-feed venues can drop in with `import { parseVEvents } from "../utils/ical-parser"` rather than copying the parser
- Single source of truth for iCal handling makes future extensions (UTC support, RRULE expansion) trivial to add when needed
