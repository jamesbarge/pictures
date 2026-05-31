# result-types: delete unused totalResults export

**PR**: #128
**Date**: 2026-05-30

## Changes
- Removed the unused `totalResults(results: PaletteResults): number` export from `frontend/src/lib/search/result-types.ts` (previously lines 172-174).

## Impact
- Dead-code cleanup only. The function had zero importers across `frontend/src` and `src`. The only other `totalResults` occurrences are an unrelated local `const totalResults` inside `SearchInput.svelte` (derived from `films.length + cinemas.length` — a different symbol). The palette store computes counts via `flattenResults(...).length` / `flatRows.length` directly, so nothing depended on this helper.

## Behavior preservation
- No runtime behavior changes. The deleted symbol was never imported or invoked anywhere, so removing it cannot alter any code path or output. `svelte-check --threshold error` passes with 0 errors (2 pre-existing warnings in unrelated files remain unchanged).
