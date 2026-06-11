# Frontend London-Time Consistency

**PR:** #664

## Problem

Reachable-screening deadlines and labels used the visitor's device timezone,
which produced incorrect times outside the UK. London civil-date arithmetic was
also duplicated across search, filters, and route loaders, with `/this-weekend`
selecting the following weekend when opened on Sunday.

## Changes

- Added a shared DST-aware `frontend/src/lib/london-date.ts` module for London
  civil dates, clocks, date construction, date addition, and weekend ranges.
- Made reachable deadline construction and display explicitly use
  `Europe/London`.
- Added `Europe/London` to the Letterboxd import result's next-screening date.
- Replaced duplicate date arithmetic in command-palette parsing, filter
  presets, active filter surfaces, film detail labels, and the tonight/weekend
  route loaders.
- Standardized "this weekend" as the current Saturday through Sunday,
  including when requested on Sunday.
- Added DST, Sunday-weekend, preset-construction, and travel-time regression
  tests.

## Verification

- `npm test` in `frontend/`
- `TZ=America/New_York npm test -- --run src/lib/london-date.test.ts src/lib/search/parse-query.test.ts src/lib/travel-time.test.ts`
- `npm run check` in `frontend/`
- `npm run build` in `frontend/` (SSR/client compilation passed; sandbox
  prerender then stopped because `/about` could not reach its API dependency)
- `npm run lint`
