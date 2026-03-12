# Kaizen — Extract TMDB Client Constants

**PR**: #XX
**Date**: 2026-03-13

## Changes
- Extract `86400` to `TMDB_CACHE_REVALIDATE_SEC = 24 * 60 * 60`
- Extract `"Director"` to `DIRECTOR_JOB` (used twice in cast/crew filtering)
- Extract `.slice(0, 10)` to `MAX_CAST_MEMBERS = 10`

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: extract-constant
