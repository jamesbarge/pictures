# filters store: hoist duplicated en-CA London Intl formatter out of applyIntent

**PR**: #120
**Date**: 2026-05-30

## Changes
- Hoisted a single module-level `const LONDON_YMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })` near the top of `frontend/src/lib/stores/filters.svelte.ts`.
- Replaced the two byte-identical inline `new Intl.DateTimeFormat(...)` instances inside `applyIntent` (one for `dateFrom`, one for `dateTo`) with calls to the shared `LONDON_YMD.format(...)`.

## Impact
- `applyIntent` runs on the cmd+k palette intent-apply path. The previous code allocated two fresh `Intl.DateTimeFormat` instances per call; this removes both allocations by reusing one stateless module-scope formatter.
- Mirrors the established hoist pattern (`DATE_LONDON_ISO` in `utils.ts`).

## Behavior preservation
- The hoisted formatter uses the exact same locale (`en-CA`) and options (`timeZone: 'Europe/London'`, `year: 'numeric'`, `month: '2-digit'`, `day: '2-digit'`) as the two original inline formatters.
- `Intl.DateTimeFormat` is stateless, so reusing one instance yields identical `YYYY-MM-DD` strings, including across DST boundaries.
- Output is byte-identical; no rendered or stored value changes.
