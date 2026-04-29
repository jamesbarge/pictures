/**
 * Unit tests for src/scheduler/catch-up.ts — Phase 5 self-healing helper.
 *
 * Mocks:
 *   - @/db.execute → controllable scraper_runs aggregate result
 *   - @/scrapers/registry → fixed minimal SCRAPER_REGISTRY (so the test
 *     doesn't depend on which 27 cinemas are currently registered)
 *   - bree (instance is parameter-injected) → simple stub with a workers
 *     Map and run() that records calls
 *
 * Verifies:
 *   - "all up to date" path returns 0 dispatched
 *   - cinemas with no successful run ever → due
 *   - cinemas with last run >24h ago → due
 *   - cinemas with last run <24h ago → not due
 *   - enrichment-wave entries are excluded from catch-up
 *   - dispatch sets SCHEDULER_CATCHUP_TASK_ID and waits for worker exit
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

const dbExecuteMock = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({
  db: { execute: dbExecuteMock },
  isDatabaseAvailable: true,
}));

vi.mock("@/config/cinema-registry", () => ({
  getCinemaById: (id: string) => ({ id, name: id.toUpperCase() }),
}));

// Hoist the fixture so it exists when vi.mock's factory runs.
const FIXTURE_REGISTRY = vi.hoisted(() => {
  const buildSingleConfig = (id: string) => ({
    type: "single" as const,
    venue: { id, name: id, shortName: id },
    createScraper: () => ({} as never),
  });
  return [
    {
      taskId: "scraper-genesis",
      type: "single",
      wave: "cheerio",
      buildConfig: () => buildSingleConfig("genesis"),
    },
    {
      taskId: "scraper-bfi",
      type: "single",
      wave: "playwright",
      buildConfig: () => buildSingleConfig("bfi-southbank"),
    },
    {
      taskId: "enrichment-letterboxd",
      type: "single",
      wave: "enrichment",
      buildConfig: () => buildSingleConfig("letterboxd"),
    },
  ];
});

vi.mock("@/scrapers/registry", () => ({
  SCRAPER_REGISTRY: FIXTURE_REGISTRY,
}));

import type Bree from "bree";
import { runCatchUpScan } from "./catch-up";

interface FakeBree {
  workers: Map<string, EventEmitter>;
  run: (jobName: string) => Promise<void>;
}

function makeBree(): FakeBree {
  const workers = new Map<string, EventEmitter>();
  return {
    workers,
    async run(jobName: string) {
      const emitter = new EventEmitter();
      workers.set(jobName, emitter);
      // Simulate quick worker exit on next tick so waitForWorkerExit resolves
      setImmediate(() => {
        emitter.emit("exit");
        workers.delete(jobName);
      });
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SCHEDULER_CATCHUP_TASK_ID;
});

afterEach(() => {
  delete process.env.SCHEDULER_CATCHUP_TASK_ID;
});

describe("runCatchUpScan", () => {
  it("returns 0 dispatched when every non-enrichment cinema is fresh", async () => {
    const fresh = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1h ago
    dbExecuteMock.mockResolvedValueOnce([
      { cinemaId: "genesis", lastCompletedAt: fresh },
      { cinemaId: "bfi-southbank", lastCompletedAt: fresh },
    ]);

    const bree = makeBree();
    const result = await runCatchUpScan(bree as unknown as Bree);

    expect(result.totalDue).toBe(0);
    expect(result.dispatched).toEqual([]);
  });

  it("flags cinemas with no successful run on record as due", async () => {
    // No row at all for genesis → never run.
    const fresh = new Date(Date.now() - 1 * 60 * 60 * 1000);
    dbExecuteMock.mockResolvedValueOnce([
      { cinemaId: "bfi-southbank", lastCompletedAt: fresh },
    ]);

    const bree = makeBree();
    const result = await runCatchUpScan(bree as unknown as Bree);

    expect(result.totalDue).toBe(1);
    expect(result.dispatched).toEqual(["scraper-genesis"]);
  });

  it("flags cinemas with last run >24h ago as due", async () => {
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const fresh = new Date(Date.now() - 1 * 60 * 60 * 1000);
    dbExecuteMock.mockResolvedValueOnce([
      { cinemaId: "genesis", lastCompletedAt: stale },
      { cinemaId: "bfi-southbank", lastCompletedAt: fresh },
    ]);

    const bree = makeBree();
    const result = await runCatchUpScan(bree as unknown as Bree);

    expect(result.totalDue).toBe(1);
    expect(result.dispatched).toEqual(["scraper-genesis"]);
  });

  it("excludes enrichment-wave entries from catch-up entirely", async () => {
    // No rows at all → every entry would be 'due', but the enrichment
    // entry must be filtered out.
    dbExecuteMock.mockResolvedValueOnce([]);

    const bree = makeBree();
    const result = await runCatchUpScan(bree as unknown as Bree);

    expect(result.dispatched).toContain("scraper-genesis");
    expect(result.dispatched).toContain("scraper-bfi");
    expect(result.dispatched).not.toContain("enrichment-letterboxd");
  });

  it("dispatches sequentially via SCHEDULER_CATCHUP_TASK_ID env var", async () => {
    dbExecuteMock.mockResolvedValueOnce([]);

    const bree = makeBree();
    const runSpy = vi.spyOn(bree, "run");
    const envValuesObservedAtRun: string[] = [];
    bree.run = async (jobName: string) => {
      envValuesObservedAtRun.push(process.env.SCHEDULER_CATCHUP_TASK_ID ?? "<unset>");
      const emitter = new EventEmitter();
      bree.workers.set(jobName, emitter);
      setImmediate(() => {
        emitter.emit("exit");
        bree.workers.delete(jobName);
      });
    };

    await runCatchUpScan(bree as unknown as Bree);

    // Every dispatch should have been preceded by an env-var write of the
    // entry's taskId; the test fixture has 2 non-enrichment entries.
    expect(envValuesObservedAtRun.length).toBeGreaterThanOrEqual(2);
    expect(envValuesObservedAtRun.every((v) => v.startsWith("scraper-"))).toBe(true);
    runSpy.mockRestore();
  });
});
