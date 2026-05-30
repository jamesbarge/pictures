# Hoist the per-call Intl.DateTimeFormat builders in parse-query.ts to module scope

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- Hoisted the three constant-config `Intl.DateTimeFormat` instances used by `frontend/src/lib/search/parse-query.ts` to module scope:
  - `LONDON_DATE_ISO` — `en-CA`, `Europe/London`, 2-digit year/month/day (used by `londonDateString`)
  - `LONDON_WEEKDAY_SHORT` — `en-GB`, weekday `short`, `Europe/London` (used by `londonDayOfWeek`)
  - `LONDON_SHORT_OFFSET` — `en-GB`, `Europe/London`, `shortOffset` timeZoneName (used by `londonMidnight`)
- `londonDateString`/`londonDayOfWeek`/`londonMidnight` now call `.format()` / `.formatToParts()` on the hoisted instances instead of constructing a fresh formatter on every invocation.
- Matches the existing cached-formatter pattern in `$lib/utils.ts` and `calendar-filter.ts`.

## Impact
- Affects the cmd+k command palette: `parseQuery()` runs on every keystroke (`palette.svelte.ts`: `parsed = $derived(parseQuery(query, new Date(nowTick)))`). A temporal query such as "this weekend tarkovsky" previously rebuilt ~4 `Intl.DateTimeFormat` instances per keystroke; now zero are constructed per call (the ICU locale/timezone load happens once at module load).
- Metric moved: INP / palette keystroke latency — eliminates ~3-5 `Intl.DateTimeFormat` constructions per temporal-query parse, repeated on every keystroke. `.format()`/`.formatToParts()` remain the only per-call work, which is cheap.

## Behavior preservation
Pure refactor — the formatter configs are constant and byte-identical to the per-call versions, so all parsed output (date ranges, day-of-week math, DST-aware London offsets, chip descriptors, freeText) is unchanged. Acceptance test: `cd frontend && npx vitest run src/lib/search/parse-query.test.ts` keeps every snapshot/assertion green; additionally verified old-vs-hoisted output identical across 5,760 samples spanning both 2025 BST/GMT DST transitions (0 mismatches).
