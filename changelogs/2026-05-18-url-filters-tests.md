# Add unit tests for src/lib/url-filters.ts (filter ↔ URL serialization)

**PR**: TBD
**Date**: 2026-05-18

## Changes
- `src/lib/url-filters.test.ts` (new) — 25 vitest cases covering `filtersToSearchParams`, `searchParamsToFilters`, `buildShareableUrl`, `hasFilterParams`, and a full **roundtrip** test asserting 13 fields preserve through serialize-then-deserialize.

## Coverage highlights
- 13-field roundtrip integrity (filter state → URL → back to filter state)
- timeFrom=0 (midnight) is preserved (NOT treated as falsy fallback)
- timeFrom > 23 is silently dropped (validation guard)
- Boolean flags only emit when true (false is the default — omitted from URL)
- Boolean flag deserialization only accepts "1" (not "true", "yes", "0")
- programmingTypes / timesOfDay validate against type-guards (unknown values dropped)
- Empty arrays don't emit URL keys
- Date roundtrip preserves day-precision via yyyy-MM-dd format
- buildShareableUrl returns baseUrl unchanged when no filters present
- hasFilterParams correctly distinguishes filter keys from unrelated params (e.g. `utm_source`)

## Why
This module is the link layer for shareable filter URLs. A regression silently breaks pictures.london's "share this filter" feature — and worse, can corrupt user-saved bookmarks. The full roundtrip test catches any drift between serialize and deserialize paths.

The timeFrom=0 case is particularly worth pinning: the implementation uses `!== null && !== undefined` rather than truthiness, so midnight times are preserved. A refactor to `if (filters.timeFrom)` would silently break midnight-start filters.

## Changelog deferral note
Per #523-#530.
