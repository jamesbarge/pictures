# Kaizen — Rename cryptic single-letter variables

**PR**: #160
**Date**: 2026-03-12

## Changes
- `src/scrapers/bfi-pdf/cleanup.ts`: Renamed `t` → `normalized` in the `normalize()` function (8 occurrences through regex chain)
- `src/scrapers/utils/browser.ts`: Renamed `b` → `activeBrowser` in `createPage()` to avoid shadowing module-level `browser` singleton
- `src/trigger/scrape-all.ts`: Renamed `arr` → `items` in generic `chunk<T>()` utility function

## Impact
- Code quality improvement, no behavior changes
- Improved readability of title normalization pipeline and browser page creation
- Kaizen category: naming
