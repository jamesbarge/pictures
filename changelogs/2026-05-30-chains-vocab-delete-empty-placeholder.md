# chains vocab: remove unused empty CHAIN_PHRASES_BY_LENGTH placeholder

**PR**: #129
**Date**: 2026-05-30

## Changes
- Deleted the `CHAIN_PHRASES_BY_LENGTH: Record<number, string[]> = { 2: [] }` export (and its `// Multi-word phrases for chains.` comment) from `frontend/src/lib/search/vocab/chains.ts`.

## Impact
- Affects the search vocabulary module only. The export was an always-empty placeholder, never imported anywhere in the codebase — a repo-wide grep matched only its own definition.
- `parse-query.ts` imports `CHAIN_TOKENS`, `CINEMA_ALIAS_TOKENS`, and `CINEMA_ALIAS_PHRASES_BY_LENGTH` from this file but never `CHAIN_PHRASES_BY_LENGTH`, and runs no chain-phrase scan. Removing it eliminates dead code that implied a non-existent multi-word-chain feature.

## Behavior preservation
- Byte-identical runtime behavior. The deleted constant was never read by any module, so no code path changes.
- `svelte-kit sync` + `svelte-check --tsconfig ./tsconfig.json --threshold error` reports 0 errors after the change (2 pre-existing warnings in unrelated components remain unchanged).
