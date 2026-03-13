# Kaizen — Remove 5 Unused Vars/Imports in DB Scripts

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- `src/db/repositories/cinema.ts` — Removed unused `inArray` import from drizzle-orm
- `src/db/enrich-directors.ts` — Removed unused `TMDBClient` import (only `getTMDBClient` needed)
- `src/db/enrich-letterboxd.ts` — Changed `catch (error)` to bare `catch` (error variable unused)
- `src/db/backfill-posters.ts` — Removed unused `sql` import and unused `result` variable assignment

## Impact
- Code quality improvement, no behavior changes
- Reduces lint warnings from 38 to 33
- Kaizen category: lint-fix
