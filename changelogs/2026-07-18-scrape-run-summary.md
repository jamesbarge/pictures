# /scrape run-summary JSON + warn states + skill rewrite (/scrape improvements, PR 1)

**PR**: #TBD
**Date**: 2026-07-18

## Changes
- New `src/lib/scrape-run-summary.ts`: persists one machine-readable JSON per unified pipeline run.
  - Latest run at `tmp/scrape-run-summary.json` (env override `SCRAPE_SUMMARY_FILE`); dated history copies in `tmp/scrape-runs/`, pruned to the last 20.
  - Atomic-write pattern (unique temp name + rename, swallow-and-warn) copied from `scrape-progress.ts` — same rationale as the 2026-06-11 rename-race incident.
  - `RunSummary` carries: `runId`, timestamps, `durationMin`, CLI args, run `status` (`ok` / `ok-with-warnings` / `failed` / `crashed`), per-phase results, `screeningsBefore`/`screeningsAfter`, and typed health arrays (`QuarantinedCinema[]`, `FlakyCinema[]`, `YieldDropCinema[]`, `YieldDelta[]`, `StaleCinema[]`, `DqsSnapshot`).
  - Unit test `src/lib/scrape-run-summary.test.ts` (round-trip, history prune, status derivation, write-failure resilience).
- `src/scripts/run-scrape-and-enrich.ts`:
  - Phases get stable machine-readable ids (`preflight | scrape | lcut | cleanup | audit | rematch | health | yield-delta`) — the upcoming checkpoint/resume feature keys off these.
  - New `warn` phase state, rendered ⚠ in the final summary: scrape zero-counts/anomalies, pre-flight/health detector hits, yield deltas, L-CUT regressions + unmapped venues. Exit-code contract unchanged (warn never exits 1).
  - Captures total screening counts at run start/end (previously done by the slash command via ad-hoc DB queries).
  - Writes the run summary on every exit path, including a `status: "crashed"` summary from the fatal handler with whatever phases completed.
- `src/lib/scrape-quarantine.ts`:
  - **Bug fix**: `detectStaleCinemas` returned `hours_since` as a string (postgres.js NUMERIC behavior), so `formatStaleCinemaReport`'s `.toFixed()` threw on every run — silently swallowed by the orchestrator's defensive catch, meaning the stale-cinema report **never printed**. Now coerced to number.
  - Stale report phrasing: "never run" instead of "last run never run ago".
- `.claude/commands/scrape.md` rewritten:
  - Steps 2/4/5 now read the summary JSON instead of hand-rolling drizzle queries in inline `tsx -e` snippets.
  - New `status` arg: reads `tmp/scrape-progress.json`, reports current wave/cinema/phase, warns if the heartbeat is >10 min stale.
  - New `report` arg: re-prints the last run summary without running anything.
  - New Step 5b: writes a dated Obsidian run report to `Pictures/Scrape Runs/YYYY-MM-DD.md` (formatted by the skill from the JSON — the orchestrator stays local-tmp-only).

## Impact
- `/scrape` reporting is now driven by one artifact — faster (no post-run DB queries), consistent, and available even after a crash.
- Silent-breaker states (`success+0`, anomalies) are visible at the phase level (⚠) instead of masquerading as ✓.
- Run history in `tmp/scrape-runs/` gives before/after evidence for the follow-up speed PR (wave-merge timing comparison).
- Stale-cinema visibility restored after months of silent breakage.

## Verification
- `npx tsx` smoke test: round-trip, 23-write prune to 20, status derivation, no orphan temp files — OK.
- `npm run scrape:unified -- --skip-scrape --skip-enrich`: summary written with correct phases/health/counts; ⚠ markers render; stale report prints 14 cinemas.
- `npx tsc --noEmit` clean; `npm run lint` 0 errors.
- Vitest suite runs in CI (local vitest workers currently wedge on this machine).
