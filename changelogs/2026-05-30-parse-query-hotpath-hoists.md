# parse-query: memoize phrase Sets/maxLen + hoist constant arrays off keystroke hot path

**PR**: #101
**Date**: 2026-05-30

## Changes
`frontend/src/lib/search/parse-query.ts` — `parseQuery` runs via a `$derived` on
every cmd+k keystroke (`palette.svelte.ts`) and calls `scanPhrases` ~9x per
keystroke over constant module-level phrase tables. Four allocations were moved
off the per-keystroke hot path:

- **Memoized `scanPhrases` per-table work** — added a module-level
  `COMPILED_PHRASES` `WeakMap<Record<number, string[]>, CompiledPhrases>` and a
  `compilePhrases()` helper. The per-length `new Set(phrases)` (previously rebuilt
  inside the length loop on every call) and the `maxLen` derivation (previously
  `Math.max(0, ...Object.keys(...).map(Number))` per call) are now computed once
  per phrase-table object and cached. The inner scan reads from the cached `Set`.
- **Hoisted `NEXT_DAY_PHRASES_BY_LENGTH`** — the `{ 2: Object.keys(DAY_NAMES).map((d) => `next ${d}`) }`
  table (14-element array) was built inline on every `parseQuery` call; it is now a
  module-level `const` computed once at load.
- **Lifted `WEEKDAY_LABELS`** — `applyNextDay` and `applyDayThisWeek` each
  allocated an identical `["SUN","MON","TUE","WED","THU","FRI","SAT"]` literal per
  call. Both now index a single module-level `const WEEKDAY_LABELS`.

## Impact
- cmd+k command palette only. Fewer allocations per keystroke on the parse hot
  path; no API, data, or output change.

## Behavior preservation
- Pure constant-data refactor — the phrase tables and weekday labels are fixed,
  so memoizing/hoisting them yields byte-identical parse output.
- `maxLen` semantics preserved: an empty table yields `maxLen = 0` (matching the
  old `Math.max(0, ...)`), so the `len >= 2` loop is skipped exactly as before.
  Missing or empty per-length entries are still skipped (`!phraseSet` /
  `phraseSet.size === 0`, mirroring the old `!phrases || phrases.length === 0`).
- The two remaining inline `{ 2: [...] }` literals are intentionally unchanged.
- Verified: `svelte-check` 0 errors; existing `parse-query.test.ts` suite (49
  tests) passes unchanged.
