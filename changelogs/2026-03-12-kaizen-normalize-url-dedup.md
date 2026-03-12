# Kaizen — Extract shared normalizeUrl utility for scrapers

**PR**: #173
**Date**: 2026-03-12

## Changes
- Created `src/scrapers/utils/url.ts` with shared `normalizeUrl(url, baseUrl)` function
- `src/scrapers/cinemas/close-up.ts`: Replaced private `normalizeUrl` method with shared utility
- `src/scrapers/cinemas/garden.ts`: Replaced private `normalizeUrl` method with shared utility

## Impact
- Code quality improvement, no behavior changes
- Eliminated 2 identical private methods (~20 lines removed)
- 3 more scrapers have similar inline URL normalization (prince-charles, ica, barbican) for future passes
- Kaizen category: duplicate-pattern
