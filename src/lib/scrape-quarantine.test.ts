/**
 * Unit tests for the pure analyzer in scrape-quarantine.ts.
 *
 * Only `analyzeRunsForFlakiness` is tested here — it's DB-free, so we can
 * fixture it directly. The DB-walker `detectFlakyCinemas` is integration-
 * tested implicitly via /goal-check-flaky-cinemas + manual /scrape runs.
 */
import { describe, expect, it } from "vitest";
import {
  analyzeRunsForFlakiness,
  DEFAULT_FLAKY_THRESHOLDS,
  type RunRecord,
} from "./scrape-quarantine";

function makeRun(status: string, screeningCount: number | null, daysAgo: number): RunRecord {
  return {
    status,
    screeningCount,
    startedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// BFI IMAX ground truth — 14 of 21 success+0 runs in 7 days. The detector
// should fire `critical` at 67% empty ratio.
// ─────────────────────────────────────────────────────────────────────────
const bfiImaxRuns: RunRecord[] = [
  makeRun("success", 0, 0),
  makeRun("success", 0, 1),
  makeRun("success", 2, 1),    // brief recovery
  makeRun("success", 0, 2),
  makeRun("success", 0, 2),
  makeRun("success", 0, 3),
  makeRun("success", 0, 3),
  makeRun("success", 3, 4),    // brief recovery
  makeRun("success", 0, 4),
  makeRun("success", 0, 5),
];

describe("analyzeRunsForFlakiness", () => {
  it("returns null when there are fewer runs than minRuns", () => {
    const runs = [makeRun("success", 100, 0), makeRun("success", 95, 1)];
    expect(analyzeRunsForFlakiness(runs)).toBeNull();
  });

  it("returns null when all runs are healthy (success + non-zero)", () => {
    const runs = [
      makeRun("success", 100, 0),
      makeRun("success", 95, 1),
      makeRun("success", 110, 2),
      makeRun("success", 88, 3),
      makeRun("success", 102, 4),
    ];
    expect(analyzeRunsForFlakiness(runs)).toBeNull();
  });

  it("fires critical when ≥50% of runs are success+0 (BFI IMAX pattern)", () => {
    const verdict = analyzeRunsForFlakiness(bfiImaxRuns);
    expect(verdict).not.toBeNull();
    expect(verdict?.severity).toBe("critical");
    // 8 of 10 runs are empty success → 80% — above critical threshold
    expect(verdict?.emptySuccessCount).toBe(8);
    expect(verdict?.totalRuns).toBe(10);
    expect(verdict?.emptyRatio).toBeCloseTo(0.8, 1);
    expect(verdict?.failedCount).toBe(0);
    expect(verdict?.reasons[0]).toMatch(/success\+0/);
  });

  it("fires warn when empty ratio is in 30-50% range (BFI Southbank pattern)", () => {
    // 3 of 10 runs empty success = 30% — right at warn threshold
    const runs: RunRecord[] = [
      makeRun("success", 0, 0),
      makeRun("success", 200, 1),
      makeRun("success", 0, 2),
      makeRun("success", 180, 3),
      makeRun("success", 0, 4),
      makeRun("success", 220, 5),
      makeRun("success", 190, 6),
      makeRun("success", 210, 7),
      makeRun("success", 195, 8),
      makeRun("success", 205, 9),
    ];
    const verdict = analyzeRunsForFlakiness(runs);
    expect(verdict).not.toBeNull();
    expect(verdict?.severity).toBe("warn");
    expect(verdict?.emptyRatio).toBeCloseTo(0.3, 1);
  });

  it("fires warn when ≥30% of runs failed outright (Close-Up pattern)", () => {
    // 3 of 10 runs failed = 30% — at warn threshold
    const runs: RunRecord[] = [
      makeRun("failed", null, 0),
      makeRun("success", 40, 1),
      makeRun("failed", null, 2),
      makeRun("success", 35, 3),
      makeRun("success", 42, 4),
      makeRun("failed", null, 5),
      makeRun("success", 38, 6),
      makeRun("success", 39, 7),
      makeRun("success", 41, 8),
      makeRun("success", 37, 9),
    ];
    const verdict = analyzeRunsForFlakiness(runs);
    expect(verdict).not.toBeNull();
    expect(verdict?.severity).toBe("warn");
    expect(verdict?.failedRatio).toBeCloseTo(0.3, 1);
    expect(verdict?.reasons.some((r) => r.includes("failed outright"))).toBe(true);
  });

  it("escalates to critical when failed ratio crosses 50%", () => {
    const runs: RunRecord[] = Array.from({ length: 10 }, (_, i) =>
      makeRun(i < 6 ? "failed" : "success", i < 6 ? null : 50, i),
    );
    const verdict = analyzeRunsForFlakiness(runs);
    expect(verdict?.severity).toBe("critical");
    expect(verdict?.failedRatio).toBeCloseTo(0.6, 1);
  });

  it("bumps warn → critical when both signals fire at warn and critical respectively", () => {
    // Critical empty + warn failed should give critical overall
    const runs: RunRecord[] = [
      makeRun("success", 0, 0), makeRun("success", 0, 1), makeRun("success", 0, 2),
      makeRun("success", 0, 3), makeRun("success", 0, 4), // 5 empty = 50% critical
      makeRun("failed", null, 5), makeRun("failed", null, 6), makeRun("failed", null, 7), // 3 failed = 30% warn
      makeRun("success", 100, 8), makeRun("success", 100, 9),
    ];
    const verdict = analyzeRunsForFlakiness(runs);
    expect(verdict?.severity).toBe("critical");
    expect(verdict?.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("records lastGoodRunAt from the first success+nonZero in iteration order", () => {
    const runs: RunRecord[] = [
      makeRun("success", 0, 0),     // most recent: empty
      makeRun("success", 0, 1),     // empty
      makeRun("success", 50, 2),    // ← should be lastGoodRunAt
      makeRun("success", 0, 3),
      makeRun("success", 0, 4),
      makeRun("success", 60, 5),
    ];
    const verdict = analyzeRunsForFlakiness(runs);
    expect(verdict?.lastGoodRunAt).not.toBeNull();
    // The 2-days-ago run is the most recent success+nonZero
    const expectedAge = Date.now() - verdict!.lastGoodRunAt!.getTime();
    expect(expectedAge).toBeGreaterThan(1.5 * 24 * 60 * 60 * 1000);
    expect(expectedAge).toBeLessThan(2.5 * 24 * 60 * 60 * 1000);
  });

  it("respects custom thresholds (tighter bar for warn)", () => {
    // 2 of 10 empty = 20%. Default warn is 30%, so default verdict = null.
    // With warn=0.15, the same data should fire warn.
    const runs: RunRecord[] = [
      makeRun("success", 0, 0), makeRun("success", 0, 1),
      ...Array.from({ length: 8 }, (_, i) => makeRun("success", 100, i + 2)),
    ];
    expect(analyzeRunsForFlakiness(runs)).toBeNull();
    expect(
      analyzeRunsForFlakiness(runs, { ...DEFAULT_FLAKY_THRESHOLDS, emptyRatioWarn: 0.15 })
        ?.severity,
    ).toBe("warn");
  });
});
