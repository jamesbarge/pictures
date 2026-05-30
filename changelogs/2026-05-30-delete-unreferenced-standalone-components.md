# Delete 4 unreferenced standalone components (DaySection, TableView, MobilePanel, Skeleton)

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- Deleted `frontend/src/lib/components/calendar/DaySection.svelte` (120 lines)
- Deleted `frontend/src/lib/components/calendar/TableView.svelte` (305 lines)
- Deleted `frontend/src/lib/components/ui/MobilePanel.svelte` (36 lines)
- Deleted `frontend/src/lib/components/ui/Skeleton.svelte` (29 lines)
- All four had zero references anywhere in `frontend/src`, `frontend/tests`, and `frontend/test-all.spec.ts` (verified by grep excluding the files themselves). None were dynamically imported.
- No other source edits required — there were no importers to update. Internal imports those files used (FilmCard, formatScreeningDate, Badge, formatTime, trackBookingClick) remain live via other consumers, so there is no further cascade.

## Impact
- Bundle / tooling: removes ~490 lines / 4 components from the svelte-check parse cost and the bundler dependency graph. These components were already tree-shaken from shipped chunks (never mounted) but were still parsed and scanned by tooling and discoverable to the bundler graph.

## Behavior preservation
- Rendered DOM of every route is byte-identical because the deleted components were never mounted anywhere. Acceptance: `npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json --threshold error` reports 0 errors (2 pre-existing warnings), and `npx vite build` succeeds with no missing-import/resolution errors.
