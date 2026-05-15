import { describe, expect, it } from "vitest";
import {
  analyzeRunsForFlakiness,
  DEFAULT_FLAKY_THRESHOLDS,
  formatFlakyReport,
  type FlakyCinema,
  type RunRecord,
} from "./scrape-quarantine";

function makeRun(
  status: string,
  screeningCount: number | null,
  daysAgo: number,
): RunRecord {
  return {
    status,
    screeningCount,
    startedAt: new Date(`2026-05-${15 - daysAgo}T01:00:00Z`),
  };
}

describe("analyzeRunsForFlakiness", () => {
  it("returns null when window is below minRuns (avoids false-flagging new cinemas)", () => {
    const runs = [makeRun("success", 0, 0), makeRun("success", 0, 1)];
    expect(analyzeRunsForFlakiness(runs)).toBeNull();
  });

  it("returns null for healthy cinemas (every run yields)", () => {
    const runs = [
      makeRun("success", 200, 0),
      makeRun("success", 195, 1),
      makeRun("success", 210, 2),
      makeRun("success", 188, 3),
      makeRun("success", 205, 4),
    ];
    expect(analyzeRunsForFlakiness(runs)).toBeNull();
  });

  it("flags BFI IMAX pattern (14/21 empty success) as critical", () => {
    // Synthesise the production pattern: alternating empty / non-empty
    const runs: RunRecord[] = [];
    for (let i = 0; i < 21; i++) {
      runs.push(i % 3 === 0 ? makeRun("success", 5, i) : makeRun("success", 0, i));
    }
    // lookback defaults to 10 — slice the most recent 10
    const verdict = analyzeRunsForFlakiness(runs.slice(0, 10));
    expect(verdict).not.toBeNull();
    expect(verdict!.severity).toBe("critical");
    expect(verdict!.reasons.join(" ")).toMatch(/success\+0/);
  });

  it("flags BFI Southbank pattern (50% empty success) as critical", () => {
    const runs: RunRecord[] = [];
    for (let i = 0; i < 10; i++) {
      runs.push(i % 2 === 0 ? makeRun("success", 250, i) : makeRun("success", 0, i));
    }
    const verdict = analyzeRunsForFlakiness(runs);
    expect(verdict).not.toBeNull();
    expect(verdict!.severity).toBe("critical");
    expect(verdict!.emptyRatio).toBe(0.5);
  });

  it("flags Close-Up pattern (33% failed) as warn", () => {
    const runs: RunRecord[] = [
      makeRun("success", 39, 0),
      makeRun("failed", null, 1),
      makeRun("success", 35, 2),
      makeRun("failed", null, 3),
      makeRun("success", 41, 4),
      makeRun("failed", null, 5),
      makeRun("success", 40, 6),
      makeRun("success", 42, 7),
      makeRun("success", 38, 8),
    ];
    const verdict = analyzeRunsForFlakiness(runs);
    expect(verdict).not.toBeNull();
    expect(verdict!.severity).toBe("warn");
    expect(verdict!.reasons.some((r) => /failed outright/.test(r))).toBe(true);
  });

  it("escalates to critical when warn signal AND failed signal both fire", () => {
    // 40% empty success (warn) + 50% failed (critical) → critical
    const runs: RunRecord[] = [
      makeRun("success", 0, 0),
      makeRun("success", 0, 1),
      makeRun("failed", null, 2),
      makeRun("failed", null, 3),
      makeRun("failed", null, 4),
      makeRun("success", 100, 5),
      makeRun("failed", null, 6),
      makeRun("success", 0, 7),
      makeRun("success", 0, 8),
      makeRun("failed", null, 9),
    ];
    const verdict = analyzeRunsForFlakiness(runs);
    expect(verdict).not.toBeNull();
    expect(verdict!.severity).toBe("critical");
  });

  it("respects custom thresholds", () => {
    const runs = [
      makeRun("success", 0, 0),
      makeRun("success", 0, 1),
      makeRun("success", 10, 2),
      makeRun("success", 10, 3),
      makeRun("success", 10, 4),
    ];
    // 40% empty — under default warn (30% → would warn), but if we set warn=50% it shouldn't fire
    const strictThresholds = {
      ...DEFAULT_FLAKY_THRESHOLDS,
      emptyRatioWarn: 0.5,
      emptyRatioCritical: 0.7,
    };
    expect(analyzeRunsForFlakiness(runs, strictThresholds)).toBeNull();
    // With defaults (warn=0.3) it should fire
    const lenient = analyzeRunsForFlakiness(runs);
    expect(lenient).not.toBeNull();
    expect(lenient!.severity).toBe("warn");
  });

  it("records lastGoodRunAt as the most recent successful non-empty run", () => {
    const runs: RunRecord[] = [
      makeRun("success", 0, 0),
      makeRun("success", 0, 1),
      makeRun("success", 100, 2), // ← this is the last-good
      makeRun("success", 0, 3),
      makeRun("success", 200, 4),
    ];
    const verdict = analyzeRunsForFlakiness(runs);
    expect(verdict).not.toBeNull();
    expect(verdict!.lastGoodRunAt?.toISOString()).toBe(
      runs[2].startedAt.toISOString(),
    );
  });
});

describe("formatFlakyReport", () => {
  it("returns a clean message when nothing is flaky", () => {
    expect(formatFlakyReport([])).toBe("No flaky cinemas detected.");
  });

  it("renders critical + warn entries with the right markers", () => {
    const sample: FlakyCinema[] = [
      {
        cinemaId: "bfi-imax",
        cinemaName: "BFI IMAX",
        totalRuns: 10,
        emptySuccessCount: 7,
        failedCount: 0,
        emptyRatio: 0.7,
        failedRatio: 0,
        lastGoodRunAt: new Date("2026-05-10T00:00:00Z"),
        lastRunAt: new Date("2026-05-15T00:00:00Z"),
        reasons: ["70% of recent runs returned success+0"],
        severity: "critical",
      },
      {
        cinemaId: "close-up-cinema",
        cinemaName: "Close-Up",
        totalRuns: 9,
        emptySuccessCount: 0,
        failedCount: 3,
        emptyRatio: 0,
        failedRatio: 0.33,
        lastGoodRunAt: new Date("2026-05-14T00:00:00Z"),
        lastRunAt: new Date("2026-05-15T00:00:00Z"),
        reasons: ["33% of recent runs failed outright"],
        severity: "warn",
      },
    ];
    const out = formatFlakyReport(sample);
    expect(out).toContain("Flaky cinemas (2)");
    expect(out).toContain("🔴 critical BFI IMAX");
    expect(out).toContain("🟡 warn Close-Up");
  });
});
