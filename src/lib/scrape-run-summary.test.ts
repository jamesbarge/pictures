/**
 * scrape-run-summary — write/read round-trip, history pruning, status
 * derivation, and write-failure resilience (must never throw).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunSummary, SummaryPhase } from "./scrape-run-summary";

const TEST_ROOT = join(tmpdir(), `scrape-run-summary-test-${process.pid}-${Date.now()}`);

async function loadModule(summaryFile: string) {
  vi.resetModules();
  vi.stubEnv("SCRAPE_SUMMARY_FILE", summaryFile);
  return import("./scrape-run-summary");
}

function makeSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  const startedAt = new Date().toISOString();
  return {
    runId: `${startedAt}-${process.pid}`,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMin: 1.5,
    args: { skipScrape: false, skipEnrich: false, skipLcut: false },
    status: "ok",
    phases: [
      { id: "preflight", label: "Pre-flight", ok: true, durationMin: 0.1 },
      { id: "scrape", label: "Scrape", ok: true, durationMin: 1.2, detail: "26 ok / 0 failed" },
    ],
    screeningsBefore: 1000,
    screeningsAfter: 1100,
    health: {
      silentBreakers: [],
      flaky: [],
      yieldDrops: [],
      yieldDeltas: [],
      stale: [],
      dqs: null,
    },
    ...overrides,
  };
}

describe("writeRunSummary / readRunSummary", () => {
  beforeEach(async () => {
    await fs.rm(TEST_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await fs.rm(TEST_ROOT, { recursive: true, force: true });
  });

  it("round-trips a summary through the latest-run file (fresh checkout, no tmp/)", async () => {
    const summaryFile = join(TEST_ROOT, "tmp", "scrape-run-summary.json");
    const { writeRunSummary, readRunSummary } = await loadModule(summaryFile);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const summary = makeSummary({ status: "ok-with-warnings" });
    await writeRunSummary(summary);

    expect(warn).not.toHaveBeenCalled();
    const back = await readRunSummary();
    expect(back).toEqual(summary);
  });

  it("writes a dated history copy alongside the latest-run file", async () => {
    const summaryFile = join(TEST_ROOT, "tmp", "scrape-run-summary.json");
    const { writeRunSummary } = await loadModule(summaryFile);

    await writeRunSummary(makeSummary());

    const files = await fs.readdir(join(TEST_ROOT, "tmp", "scrape-runs"));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.json$/);
    // No orphaned temp files from the atomic writes.
    const leftovers = (await fs.readdir(join(TEST_ROOT, "tmp"))).filter((f) => f.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("prunes history to the most recent 20 runs, dropping the oldest", async () => {
    const summaryFile = join(TEST_ROOT, "tmp", "scrape-run-summary.json");
    const { writeRunSummary } = await loadModule(summaryFile);

    const base = Date.parse("2026-07-01T00:00:00.000Z");
    for (let i = 0; i < 23; i++) {
      await writeRunSummary(makeSummary({ startedAt: new Date(base + i * 60_000).toISOString() }));
    }

    const files = (await fs.readdir(join(TEST_ROOT, "tmp", "scrape-runs"))).sort();
    expect(files).toHaveLength(20);
    // Oldest three (00:00, 00:01, 00:02) pruned; oldest survivor is minute 3.
    expect(files[0]).toContain("2026-07-01T00-03-00");
  });

  it("readRunSummary returns null when no run has written yet", async () => {
    const summaryFile = join(TEST_ROOT, "tmp", "scrape-run-summary.json");
    const { readRunSummary } = await loadModule(summaryFile);
    expect(await readRunSummary()).toBeNull();
  });

  it("swallows write failures with a single warn (never throws)", async () => {
    const summaryFile = join(TEST_ROOT, "tmp", "scrape-run-summary.json");
    const { writeRunSummary } = await loadModule(summaryFile);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Make the target dir path unusable: create a FILE where the dir should be.
    await fs.mkdir(TEST_ROOT, { recursive: true });
    await fs.writeFile(join(TEST_ROOT, "tmp"), "not a directory");

    await expect(writeRunSummary(makeSummary())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("computeRunStatus", () => {
  const phase = (ok: boolean, warn?: boolean): SummaryPhase => ({
    id: "scrape",
    label: "Scrape",
    ok,
    warn,
    durationMin: 1,
  });

  it("is failed when any phase failed, even if others warned", async () => {
    const { computeRunStatus } = await import("./scrape-run-summary");
    expect(computeRunStatus([phase(true, true), phase(false)])).toBe("failed");
  });

  it("is ok-with-warnings when all ok but any warned", async () => {
    const { computeRunStatus } = await import("./scrape-run-summary");
    expect(computeRunStatus([phase(true), phase(true, true)])).toBe("ok-with-warnings");
  });

  it("is ok when all phases ok with no warnings", async () => {
    const { computeRunStatus } = await import("./scrape-run-summary");
    expect(computeRunStatus([phase(true), phase(true)])).toBe("ok");
  });
});
