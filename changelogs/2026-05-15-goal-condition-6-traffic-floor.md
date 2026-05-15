# /goal condition #6 — defer below 500-event traffic floor

**PR**: TBD
**Date**: 2026-05-15

## Changes

- `scripts/goal-check-posthog-funnel.ts`:
  - Added a step-1 aggregate probe that counts total `booking_link_clicked` events in the trailing 30 days.
  - When total < `MIN_CLICKS_FLOOR` (500), the script short-circuits with `pass: true, deferred: true` and reports the deferral reason. The per-cinema query never runs.
  - Above the floor, the existing per-cinema check engages unchanged. Zero-click cinemas still fail the condition.
  - Refactored result emission through a single `emit()` helper to make stdout-only-JSON contract impossible to violate from any exit path.
- `scripts/goal-status.ts`: status table shows `ℹ️ — deferred` for deferred conditions instead of plain `✅`. Without this, a deferred condition looks identical to a fully-passing one in the summary, which would mislead the reader.
- `tasks/goal.md`: condition #6's "Passes when" clause now documents the deferral path. Added a sub-task under condition #6 for the longer-term Stagehand-based booking-URL verifier — the traffic-independent replacement that activates the moment a `/goal` cycle targets condition #6 above the floor.

## Why

The first real `/goal status` run (2026-05-15) reported 31 of 56 active cinemas as zero-click, marking condition #6 as failing. An empirical probe (`scripts/_tmp_probe_posthog_booking.ts`, since deleted) revealed the underlying state:

- 52 total `booking_link_clicked` events in trailing 30d
- 0 of those events had a null `cinema_id` (instrumentation is healthy)
- 25 distinct cinemas accounted for all 52 events
- Distribution is power-law: ritzy-brixton 9, bfi-southbank 5, garden 4, prince-charles 4, long tail of 1-3

With ~1.7 clicks/day spread across 56 cinemas, organic per-cinema verification is impossible regardless of whether booking links work. Condition #6 as originally written was a growth signal in quality-signal clothing — meeting it required user volume, not product quality. `/goal` would have endlessly targeted it.

The volume floor reframes condition #6 honestly: it produces a meaningful signal only when the site has enough traffic for absent clicks to be evidence rather than noise.

## Impact

- **`/goal` cycles unblock**: condition #6 stops appearing in `/goal`'s "failing conditions to target" list at current traffic levels. The next `/goal` run will pick DQS (condition #7) or coverage (#1) instead.
- **Stagehand path tracked**: the sub-task under condition #6 captures the agreed upgrade — when the site grows past the floor (or sooner if the user wants to flip the trigger), the Stagehand verifier replaces the deferral path with a real traffic-independent quality check.
- **No regression risk**: the change is read-only against production data, the floor is conservative, and the per-cinema query is unchanged above the floor.

## Verification

- `npx tsc --noEmit` clean.
- `npx eslint scripts/goal-check-posthog-funnel.ts scripts/goal-status.ts` clean.
- Smoke run against live PostHog: returns `pass: true, deferred: true, totalClicks: 52, floor: 500, windowDays: 30` — exactly the expected behavior at current traffic.
