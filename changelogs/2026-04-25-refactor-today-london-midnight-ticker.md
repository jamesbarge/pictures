# Shared "today (London)" store ticks at midnight

**PR**: TBD
**Date**: 2026-04-25

## Changes

### `frontend/src/lib/stores/today.svelte.ts` (new)
Single `$state`-backed source of truth for today's London civil date. Initialised synchronously to `toLondonDateStr(new Date())` (so SSR and the first CSR derivation agree), then re-armed on the browser via `setTimeout(tick, msUntilNextLondonMidnight() + 1000)`. Each tick:
1. Recomputes `toLondonDateStr(new Date())`.
2. Schedules the next tick.

The 1-second buffer guarantees `toLondonDateStr` has actually rolled over by the time the callback runs (Intl is millisecond-accurate but JS timers aren't).

A `visibilitychange` listener also re-checks when the tab returns from background — browsers throttle `setTimeout` in hidden tabs, so a laptop sleeping across midnight wouldn't fire the timer reliably.

`msUntilNextLondonMidnight()` reads the current London hour/minute/second via `Intl.DateTimeFormat.formatToParts`, which naturally handles BST/GMT transitions: at the spring transition the day is 23h long and we get `dayMs - elapsedMs` → 23h; at the autumn transition the day is 25h long and the timer fires for ~25h.

### Consumers migrated off `toLondonDateStr(new Date())`-per-derivation
- `frontend/src/lib/components/calendar/DayMasthead.svelte` — `activeDate` now reads `todayStore.value`.
- `frontend/src/routes/+page.svelte` — `filmMap`'s default range when no filter is set now reads from the store.
- `frontend/src/routes/film/[id]/+page.svelte` — `nextScreeningLabel` ("today" / "tomorrow" / weekday) and the day-strip's `dayLabel` ("Today" pill) now read from the store.

## Why
Two correctness issues with the previous per-derivation `new Date()` pattern:

1. **Across midnight.** `$derived.by` only re-runs when its tracked state changes. A user who leaves the homepage open across 00:00 London keeps seeing yesterday's listings until they touch a filter. The masthead has the same shape, so it could simultaneously claim "Sunday" while the grid still showed Saturday's screenings during the first derivation tick after the user interacted.

2. **Drift between consumers.** Even when re-derivations are triggered together, each consumer calls `new Date()` independently — with a tightly-shared store, all consumers read the same value within a single render frame, eliminating any chance of one of them noticing the day changed before another.

## Verification
- `npx svelte-check --threshold error` — no new errors (11 pre-existing in unrelated files).
- `Homepage` Playwright describe block: 15 passed, 1 retry-pass (persisted New filter — pre-existing). The "Pick date popover" failure is the same pre-existing flake confirmed in #445 and #447. The "search matches cinema names" failure is unrelated time-of-day fragility — late in the day, today has fewer screenings remaining and the test's specific cinema may not be in the surviving set; a separate test-quality fix.
- The `+page.svelte` lock-in test from #447 still green — confirming filmMap's default-to-today behaviour preserved through the store migration.

## Impact
- **Behaviour**: identical for the first ~24h after a page load. After a midnight rollover, all three consumers (masthead, homepage filmMap default, film-detail labels) now advance together; previously they would each pick up the new date independently, on the next interaction.
- **Performance**: one `setTimeout` per browser session, plus one `visibilitychange` listener. Negligible.
- **SSR**: the store initialises synchronously to the same value the old derivations would compute. No hydration mismatch.

## Files
- `frontend/src/lib/stores/today.svelte.ts` (new)
- `frontend/src/lib/components/calendar/DayMasthead.svelte`
- `frontend/src/routes/+page.svelte`
- `frontend/src/routes/film/[id]/+page.svelte`

## Not migrated (out of scope)
- `frontend/src/lib/utils.ts:48` (`formatScreeningDate`) — pure helper called by date-formatting code paths; coupling it to the store would invert the dependency.
- `frontend/src/lib/components/filters/MobileDatePicker.svelte:20` and `MobileFilterSheet.svelte:103` — both modal popovers that don't stay open across midnight; per-mount `new Date()` is fine.
