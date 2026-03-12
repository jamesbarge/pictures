# Kaizen — Remove unused variables and imports

**PR**: #176
**Date**: 2026-03-12

## Changes
- `src/scrapers/cinemas/castle-sidcup.ts`: Removed unused `CASTLE_SIDCUP_VENUE` constant (10 lines)
- `src/scrapers/cinemas/peckhamplex.ts`: Removed unused `PECKHAMPLEX_VENUE` constant (10 lines)
- `src/lib/film-similarity.ts`: Removed unused `isGeminiConfigured` from import (re-export on line 180 uses direct `export { } from` syntax)
- `src/lib/image-processor.ts`: Removed unused `createClient` import from `@supabase/supabase-js`
- `src/lib/sync/user-sync-service.ts`: Removed unused `PersistedFilters` type import

## Impact
- Eliminates 7 `@typescript-eslint/no-unused-vars` warnings
- Code quality improvement, no behavior changes
- Kaizen category: lint-fix
