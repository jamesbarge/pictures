# /goal command — terminal goal-driven loop with measurable end conditions

**PR**: TBD
**Date**: 2026-05-15

## Changes

- Added `tasks/goal.md` — the single canonical goal definition file. Declares the project's current top-level goal ("Pictures.london v1 — complete, fast, accessible, trustworthy"), seven measurable end conditions, and a cursor block the slash command updates after each invocation.
- Added `.claude/commands/goal.md` — the `/goal` slash command spec. Phase-by-phase: pre-flight gate → assess all conditions → achievement check (early exit if all pass) → pick the highest-leverage failing condition → pick or write one sub-task → implement on a feature branch → verify → ship behind the `ship it` deployment gate → update cursor → print summary.
- Added seven end-condition measurement scripts under `scripts/`:
  - `goal-check-coverage.ts` — parses the coverage-target list from `tasks/goal.md` and verifies each cinema slug is active in the DB and has a recent successful scrape.
  - `goal-check-silent-breakers.ts` — wraps `detectSilentBreakers` (will tighten to require zero critical flakies when the ratio-based detector lands on main).
  - `goal-check-booking-links.ts` — HEAD/GET probe of a 25-screening sample per active cinema. Passes when hard 404/410 rate is 0 AND non-2xx rate < 5%.
  - `goal-check-lighthouse.ts` — shells out to `npx lighthouse@12` for mobile + desktop. Passes when both score ≥ 90 on perf/a11y/SEO.
  - `goal-check-axe.ts` — shells out to `npx @axe-core/cli@4` for mobile + desktop viewports. Passes when zero `critical` or `serious` violations.
  - `goal-check-posthog-funnel.ts` — HogQL query for `booking_click` events per `properties.cinema_id` in trailing 30d. Passes when every active cinema has ≥ 1 click recorded.
  - `goal-check-dqs.ts` — reads the two most recent DQS scores from `.claude/data-check-learnings.json`. Passes when both are ≥ 85.
- Added `scripts/goal-status.ts` — the orchestrator. Spawns every measurement script, prints a status table, writes a machine-readable summary to `.claude/goal-status.json` for the slash command to consume. Accepts `--fast` to skip the slow checks (lighthouse + axe).

## Impact

- **Who:** The project's autonomous-improvement system. `/goal` complements but does not replace the perpetual loops (`/kaizen`, `/posthog-optimize`, `/data-check`, `/spot-check`). Those keep running indefinitely; `/goal` declares "the project is done improving along this axis" and exits.
- **Risk surface:** Zero on the backend scrape pipeline — none of the new scripts mutate data. Booking-link probes are pure HTTP HEAD/GET. PostHog query is read-only. The slash command's Phase 6 ("Ship") requires the user's `ship it` keyword, so no merges happen without explicit approval.
- **Dependency posture:** No new packages added. Lighthouse and axe-core are run via `npx`, downloaded on first invocation, cached afterwards. This honors the CLAUDE.md "no new deps without asking" rule.
- **Operational note:** End condition #6 (PostHog funnel) requires `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` in `.env.local`. The other six conditions need only the existing `.env.local` (DB + `.claude/data-check-learnings.json`).
- **First-run state (informational):** At the time of writing, the DQS floor is failing (76.62 / 77.42 vs. 85 target). The first `/goal` invocation will surface this as the targeted condition.

## Verification

- `npx tsc --noEmit` clean.
- `npx eslint scripts/goal-*.ts` clean (one `let → const` fixup applied during build).
- DQS check smoke-tested locally — returns valid JSON, correctly reports current state.
- Goal-file regex parser smoke-tested — extracts all 7 coverage-target slugs.
