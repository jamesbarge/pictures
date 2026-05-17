# /goal conditions #8 & #9 — flaky detector + BST sentinel

**PR**: TBD
**Date**: 2026-05-17

Phase 1 of the approved "make scrapers + /data-check + /scrape as perfect as they can be" plan. Adds two new end conditions to `tasks/goal.md`, growing the goal from 7 conditions to 9.

## Changes

### Condition #8 — No flaky-critical cinemas

- **`src/lib/scrape-quarantine.ts`**: resurrected the ratio-based flaky detector that was built and reverted earlier in the session. Restored: `FlakySeverity`, `FlakyCinema`, `RunRecord`, `FlakyThresholds`, `DEFAULT_FLAKY_THRESHOLDS`, the pure analyzer `analyzeRunsForFlakiness()`, the DB walker `detectFlakyCinemas()`, and `formatFlakyReport()`.
- **`src/lib/scrape-quarantine.test.ts`** (new): 9 fixture-based tests covering the BFI IMAX ground truth (8/10 empty success → critical), the Close-Up pattern (30% failed → warn), threshold-bumping (warn → critical when both signals fire), `lastGoodRunAt` ordering, and custom-thresholds plumbing. DB-free, runs in <100ms.
- **`src/scripts/run-scrape-and-enrich.ts`**: `/scrape` pre-flight now runs `detectSilentBreakers()` and `detectFlakyCinemas()` in parallel and surfaces both. Warn-level flakies are reported even when no criticals exist — gives the user lead time to investigate before warns escalate to critical.
- **`scripts/goal-check-flaky-cinemas.ts`** (new): wraps `detectFlakyCinemas()`. Passes when zero entries are at severity `critical`. Reports warn-level cinemas in the payload (informational, doesn't fail).

### Condition #9 — Zero BST-pattern screenings

- **`scripts/goal-check-bst-sentinel.ts`** (new): standing guardrail for the BST off-by-one bug class. Queries upcoming screenings at active cinemas, filters to those landing in 02:00-09:59 UK-local. Per-cinema allowlist (`LEGITIMATE_LATE_NIGHT_CINEMAS`) supported for legitimate 02:00+ programming; currently empty by design.
- **Window calibration**: the plan originally proposed 00:00-09:59 UK-local. Smoke-testing surfaced 4 false positives at Everyman Broadgate (Mulholland Drive at midnight, Obsession + Hokum at 00:15) — all real cult programming. Tightened to 02:00-09:59 (00:00-01:59 excluded) because no UK cinema sells a 3am ticket while midnight cult screenings are a real category. The BST signature lives in 02:00-06:00 anyway.

### Orchestrator + goal file

- **`scripts/goal-status.ts`**: appended `flaky-cinemas` and `bst-sentinel` to the CONDITIONS array. Status table now shows 9 rows.
- **`tasks/goal.md`**: added end conditions #8 and #9 with measurement bullets, threshold defaults, and explicit sub-tasks. Conditions #1-#7 are unchanged. Cursor block preserved.

## Why

The plan's first phase prioritises measurement substrate over fixes. Two reasons:

1. **Without the flaky detector**, the silent-breaker detector misses the BFI-IMAX-style alternating-failure pattern. Until the ratio detector exists, /goal can't tell us whether a cinema is genuinely broken or just flaky — and BFI IMAX was the canonical case that motivated the whole detection-tightening line of work earlier this session.
2. **Without the BST sentinel**, the recurring BST off-by-one bug class (Curzon 2026-05-12, Everyman 2026-05-12, Picturehouse 2026-05-12) gets caught only when a user notices a screening at 04:00 in the calendar. A standing /goal condition turns it into a measurement that fires the same day a regression is introduced.

## Verification

- `npx tsc --noEmit` clean.
- `npx vitest run src/lib/scrape-quarantine.test.ts` — 9/9 tests pass in <1s.
- `npx eslint` on every changed file clean (one pre-existing warning unchanged).
- Smoke run against live data:
  - `goal-check-flaky-cinemas.ts` → PASS (2 warn: BFI IMAX 40% empty / 20% failed; Close-Up 40% failed. 0 critical.)
  - `goal-check-bst-sentinel.ts` → PASS (0 offenders in the tightened 02:00-09:59 window).
- Full orchestrator `npx tsx scripts/goal-status.ts --fast` → status table renders 9 rows. Verdict: `5/7 measured (lighthouse + axe skipped via --fast), 1 deferred`.

## Impact

- **`/scrape` pre-flight is more informative**: in addition to silent breakers, the user now sees critical-flaky + warn-flaky cinemas before a full run. The pre-flight phase remains read-only (~5s).
- **/goal status has two more eyes on the substrate**: any future BST regression flips condition #9 red on the next status invocation. Any cinema drifting toward critical-flaky surfaces in #8 before it can ratchet down DQS by going silent.
- **No data writes, no schema changes, no new dependencies.** Pure measurement infrastructure.

## Follow-ups

- Investigate the two current warn-level flakies (BFI IMAX, Close-Up) before they escalate to critical. The flaky detector's value is the lead time; act on it.
- Phase 2 of the plan (WS-B: TMDB matcher accuracy) starts next session. Will add condition #10.
