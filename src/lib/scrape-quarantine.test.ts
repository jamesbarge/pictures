import { describe, expect, it } from "vitest";
import {
  analyzeRunsForFlakiness,
  analyzeRunsForSilentBreaker,
  analyzeYieldDrop,
  DEFAULT_FLAKY_THRESHOLDS,
  DEFAULT_YIELD_DROP_THRESHOLDS,
  formatFlakyReport,
  formatYieldDropReport,
  type FlakyCinema,
  type RunRecord,
  type SuccessRunRecord,
  type YieldDropCinema,
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

// ─────────────────────────────────────────────────────────────────────────
// Yield-drop detector
// ─────────────────────────────────────────────────────────────────────────

function makeSuccessRun(screeningCount: number, daysAgo: number): SuccessRunRecord {
  // Compute via Date arithmetic so daysAgo > 14 doesn't produce "2026-05-(-9)"
  const t = new Date("2026-05-15T01:00:00Z");
  t.setUTCDate(t.getUTCDate() - daysAgo);
  return { screeningCount, startedAt: t };
}

describe("analyzeYieldDrop", () => {
  it("returns null when below the required window size", () => {
    const runs = [makeSuccessRun(50, 0), makeSuccessRun(50, 1)];
    expect(analyzeYieldDrop(runs)).toBeNull();
  });

  it("returns null when recent and baseline are similar (healthy)", () => {
    const runs: SuccessRunRecord[] = [];
    for (let i = 0; i < 25; i++) runs.push(makeSuccessRun(200 + (i % 10), i));
    expect(analyzeYieldDrop(runs)).toBeNull();
  });

  it("flags critical when recent yield is <= 30% of baseline", () => {
    const runs: SuccessRunRecord[] = [];
    // 5 recent runs at 50 (~25% of baseline)
    for (let i = 0; i < 5; i++) runs.push(makeSuccessRun(50, i));
    // 20 baseline runs at 200
    for (let i = 5; i < 25; i++) runs.push(makeSuccessRun(200, i));

    const verdict = analyzeYieldDrop(runs);
    expect(verdict).not.toBeNull();
    expect(verdict!.severity).toBe("critical");
    expect(verdict!.recentAvg).toBe(50);
    expect(verdict!.baselineAvg).toBe(200);
    expect(verdict!.dropRatio).toBeCloseTo(0.25, 2);
  });

  it("flags warn when recent yield is between 30% and 50% of baseline", () => {
    const runs: SuccessRunRecord[] = [];
    // recent 100, baseline 250 → ratio 0.4 → warn
    for (let i = 0; i < 5; i++) runs.push(makeSuccessRun(100, i));
    for (let i = 5; i < 25; i++) runs.push(makeSuccessRun(250, i));

    const verdict = analyzeYieldDrop(runs);
    expect(verdict).not.toBeNull();
    expect(verdict!.severity).toBe("warn");
  });

  it("does NOT flag when baseline avg is below the floor (tiny cinemas excluded)", () => {
    const runs: SuccessRunRecord[] = [];
    // baseline avg = 10 (below minBaselineAvg=20), even a 90% drop must not fire
    for (let i = 0; i < 5; i++) runs.push(makeSuccessRun(1, i));
    for (let i = 5; i < 25; i++) runs.push(makeSuccessRun(10, i));

    expect(analyzeYieldDrop(runs)).toBeNull();
  });

  it("simulates the BFI 'PDF parser regression' pattern (200 → 30 screenings)", () => {
    // The exact failure mode the detector is built for: silent success+low
    const runs: SuccessRunRecord[] = [];
    for (let i = 0; i < 5; i++) runs.push(makeSuccessRun(30, i));
    for (let i = 5; i < 25; i++) runs.push(makeSuccessRun(195 + (i % 10), i));

    const verdict = analyzeYieldDrop(runs);
    expect(verdict).not.toBeNull();
    expect(verdict!.severity).toBe("critical"); // 30/199 ≈ 15% — well under critical
  });

  it("uses startedAt order from input (sorts internally) — pass ASC to verify", () => {
    const ascending: SuccessRunRecord[] = [];
    for (let i = 24; i >= 0; i--) ascending.push(makeSuccessRun(i < 5 ? 50 : 200, i));
    const verdict = analyzeYieldDrop(ascending);
    expect(verdict).not.toBeNull();
    expect(verdict!.recentAvg).toBe(50);
    expect(verdict!.baselineAvg).toBe(200);
  });

  it("respects custom thresholds", () => {
    const runs: SuccessRunRecord[] = [];
    // ratio 0.6 — under default warn (0.5), but if we set warn=0.7 it should fire
    for (let i = 0; i < 5; i++) runs.push(makeSuccessRun(120, i));
    for (let i = 5; i < 25; i++) runs.push(makeSuccessRun(200, i));

    expect(analyzeYieldDrop(runs)).toBeNull();
    const verdict = analyzeYieldDrop(runs, {
      ...DEFAULT_YIELD_DROP_THRESHOLDS,
      dropRatioWarn: 0.7,
      dropRatioCritical: 0.4,
    });
    expect(verdict?.severity).toBe("warn");
  });
});

describe("formatYieldDropReport", () => {
  it("returns a clean message when nothing dropped", () => {
    expect(formatYieldDropReport([])).toBe("No yield drops detected.");
  });

  it("renders entries with percentage drop + sample counts", () => {
    const sample: YieldDropCinema[] = [
      {
        cinemaId: "bfi-southbank",
        cinemaName: "BFI Southbank",
        recentAvg: 30,
        baselineAvg: 200,
        dropRatio: 0.15,
        recentSamples: 5,
        baselineSamples: 20,
        lastRunAt: new Date("2026-05-15T00:00:00Z"),
        severity: "critical",
      },
    ];
    const out = formatYieldDropReport(sample);
    expect(out).toContain("Yield drops (1)");
    expect(out).toContain("🔴 critical BFI Southbank");
    expect(out).toContain("yield down 85%");
    expect(out).toContain("recent avg 30 (last 5)");
    expect(out).toContain("baseline avg 200 (prior 20)");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Silent-breaker analyzer (pure)
// ─────────────────────────────────────────────────────────────────────────

describe("analyzeRunsForSilentBreaker", () => {
  it("returns null when below threshold", () => {
    const runs = [makeRun("success", 0, 0)];
    expect(analyzeRunsForSilentBreaker(runs, 2)).toBeNull();
  });

  it("flags 2 consecutive success+0 runs at default threshold", () => {
    const runs = [
      makeRun("success", 0, 0),
      makeRun("success", 0, 1),
      makeRun("success", 200, 2),
    ];
    const verdict = analyzeRunsForSilentBreaker(runs);
    expect(verdict).not.toBeNull();
    expect(verdict!.consecutiveZeroRuns).toBe(2);
    expect(verdict!.lastSuccessfulRunAt?.toISOString()).toBe(runs[2].startedAt.toISOString());
  });

  it("stops counting at the first non-zero success (lastGood)", () => {
    const runs = [
      makeRun("success", 0, 0),
      makeRun("success", 0, 1),
      makeRun("success", 0, 2),
      makeRun("success", 100, 3),
      makeRun("success", 0, 4),
    ];
    const verdict = analyzeRunsForSilentBreaker(runs);
    expect(verdict!.consecutiveZeroRuns).toBe(3);
    expect(verdict!.lastSuccessfulRunAt?.toISOString()).toBe(runs[3].startedAt.toISOString());
  });

  it("does NOT flag when most recent run is failed (different signal — out of scope)", () => {
    const runs = [
      makeRun("failed", null, 0),
      makeRun("success", 0, 1),
      makeRun("success", 0, 2),
    ];
    expect(analyzeRunsForSilentBreaker(runs)).toBeNull();
  });

  it("sorts inputs internally so ASC and DESC produce identical verdicts", () => {
    const desc = [
      makeRun("success", 0, 0),
      makeRun("success", 0, 1),
      makeRun("success", 100, 2),
    ];
    const asc = [...desc].reverse();

    const vDesc = analyzeRunsForSilentBreaker(desc);
    const vAsc = analyzeRunsForSilentBreaker(asc);
    expect(vDesc).toEqual(vAsc);
  });

  it("respects custom threshold", () => {
    const runs = [
      makeRun("success", 0, 0),
      makeRun("success", 0, 1),
    ];
    expect(analyzeRunsForSilentBreaker(runs, 3)).toBeNull();
    expect(analyzeRunsForSilentBreaker(runs, 2)).not.toBeNull();
  });
});
