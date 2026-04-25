# Defensive hardening on frontend date handling

**PR**: TBD
**Date**: 2026-04-25

## Changes

### `frontend/src/lib/utils.ts` — `toLondonDateStr` warns on invalid input
`new Date('garbage').toLocaleDateString('en-CA', { timeZone: 'Europe/London' })` returns the literal string `"Invalid Date"`. Lexicographically, `"I" (0x49) > "9" (0x39) > "0"`, so `"Invalid Date" > "2026-04-25"` for *every* current calendar date — it always sorts after a real date. In the homepage `filmMap` range filter, that means a malformed datetime trips the `dateStr > effectiveTo` branch and is silently dropped from the calendar. Same risk for `dayGroups` bucketing.

The function now `console.warn`s when `Number.isNaN(d.getTime())`, preserving the existing exclusion behaviour while surfacing the upstream data corruption to the developer console (and to PostHog session-recording playback in production). No behavioural change for valid input.

### `frontend/src/routes/+page.svelte` — soften the date-range invariant comment
The previous comment claimed "both setters always assign `dateFrom` and `dateTo` together." That holds across all 6 current call sites (`setDatePreset`, `DayMasthead.selectDate`, `MobileDatePicker`, `MobileFilterSheet`, `ActiveFilterChips` clear, `DateTimePicker.selectDate`), but the public `set dateFrom`/`set dateTo` accessors on the `filters` store allow a future caller to break the convention. The new comment names the convention plus the failure mode if it lapses.

### `frontend/src/routes/+page.svelte` — surface a one-sided date range
Adds a dev-side `console.warn` in `filmMap` when exactly one of `filters.dateFrom`/`filters.dateTo` is null, so a future setter that resets one but not the other doesn't silently collapse the range to today. The warning only fires when the invariant breaks, which today is unreachable; it's an alarm, not a runtime cost.

### `frontend/src/routes/film/[id]/+page.svelte` — same date language for the "TOMORROW" badge
The `nextScreeningLabel` derivation compared a London-civil `nextDate` against `tomorrowD.toISOString().split('T')[0]` (UTC date portion of a noon-anchored timestamp). The two strings happen to match because UTC noon and London noon are always on the same calendar day, but mixing UTC slices with London civils is the same code-smell that masked the original #445 bug. Replaced with `toLondonDateStr(tomorrowD)` so all three operands speak the same date language.

## Why
Follow-up to PR #445 review. Three of the four reviewer-flagged items were defensive (silent-failure-hunter + comment-analyzer wording + the second-opinion code-reviewer's note about a related UTC slice). They're each individually small enough that bundling them is the proportionate response.

## Verification
- `npx svelte-check --threshold error` — no new errors (11 pre-existing in unrelated files).
- `Homepage` Playwright describe block: 16 passed, 2 pre-existing flakes (Pick date popover + persisted New filter); the lock-in test from #447 still green.
- `toLondonDateStr` change is observation-only — existing `"Invalid Date"` return preserved, so no caller's behaviour shifts.
- The film detail "TOMORROW" badge swap is a semantic identity for noon-anchored Dates: `toLondonDateStr(tomorrowD)` and `tomorrowD.toISOString().split('T')[0]` produce the same YYYY-MM-DD because UTC noon is never on a different calendar day than London noon (London is always within ±1h of UTC, well clear of the day boundary).

## Files
- `frontend/src/lib/utils.ts`
- `frontend/src/routes/+page.svelte`
- `frontend/src/routes/film/[id]/+page.svelte`

## Deferred to follow-up PRs
- **Extract `filmMap` body to a pure function + wire Vitest** (pr-test-analyzer suggestion). Larger refactor; deserves its own PR with test scaffolding.
- **Shared "today (London)" `$state` ticking at midnight** to replace per-derivation `new Date()` in masthead / `filmMap` / `dayGroups` (code-reviewer round 1). Cross-cutting; warrants a small RFC-style PR.
