# utils: drop redundant nested typeof guard in formatScreeningDate

**PR**: #127
**Date**: 2026-05-30

## Changes
- In `frontend/src/lib/utils.ts`, simplified line 52 of `formatScreeningDate`.
- The expression `new Date(date + (typeof date === 'string' && !date.includes('T') ? 'T00:00:00' : ''))` sits inside the `typeof date === 'string' ? ... : date` branch, where TypeScript has already narrowed `date` to `string`. The inner `typeof date === 'string' &&` is therefore provably always `true`.
- Reduced to `new Date(date + (!date.includes('T') ? 'T00:00:00' : ''))`.

## Impact
- Affects only the internal control flow of `formatScreeningDate`, a widely-imported date formatting helper used in the SvelteKit frontend.
- No runtime behavior change for any caller.

## Behavior preservation
- The removed `typeof date === 'string' &&` term always evaluated to `true` at this point because the surrounding ternary branch guarantees `date` is a string. Removing an always-true `&&` operand leaves the conditional's result unchanged, so the concatenation argument passed to `new Date(...)` is byte-identical for every input.
- Verified with `svelte-check --threshold error`: 0 errors.
