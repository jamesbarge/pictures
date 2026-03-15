# Kaizen — Extract follow-merge helpers in festival sync route

**PR**: #358
**Date**: 2026-03-15

## Changes
- Extracted `fetchFestivalMeta()` helper to deduplicate identical 5-line DB lookups for festival name/slug
- Extracted `toMergedFollow()` helper to deduplicate near-identical 11-line server-follow-to-merged-follow object construction
- Both "server wins" and "server-only" code paths now use the shared helpers with explicit fallback parameters

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: readability
- Reduces the POST handler's follow-merge section from ~60 lines to ~35 lines
