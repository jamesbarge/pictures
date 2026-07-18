/**
 * scrape-checkpoint — init/mark/read round-trip, validity guards (age, args
 * mismatch, malformed), idempotent marks, clear.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunSummaryArgs } from "./scrape-run-summary";

const TEST_ROOT = join(tmpdir(), `scrape-checkpoint-test-${process.pid}-${Date.now()}`);
const CHECKPOINT_FILE = join(TEST_ROOT, "tmp", "scrape-checkpoint.json");

const ARGS: RunSummaryArgs = { skipScrape: false, skipEnrich: false, skipLcut: false };

async function loadModule() {
  vi.resetModules();
  vi.stubEnv("SCRAPE_CHECKPOINT_FILE", CHECKPOINT_FILE);
  return import("./scrape-checkpoint");
}

describe("scrape-checkpoint", () => {
  beforeEach(async () => {
    await fs.rm(TEST_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await fs.rm(TEST_ROOT, { recursive: true, force: true });
  });

  it("round-trips phases and scrape entries through init/mark/read", async () => {
    const cp = await loadModule();
    await cp.initCheckpoint("run-1", ARGS);
    await cp.markPhaseComplete("preflight");
    await cp.markScrapeEntryComplete("bfi");
    await cp.markScrapeEntryComplete("pcc");

    const back = await cp.readCheckpoint(ARGS);
    expect(back?.runId).toBe("run-1");
    expect(back?.completedPhases).toEqual(["preflight"]);
    expect(back?.completedScrapeEntries).toEqual(["bfi", "pcc"]);
  });

  it("marks are idempotent", async () => {
    const cp = await loadModule();
    await cp.initCheckpoint("run-1", ARGS);
    await cp.markPhaseComplete("scrape");
    await cp.markPhaseComplete("scrape");
    await cp.markScrapeEntryComplete("bfi");
    await cp.markScrapeEntryComplete("bfi");

    const back = await cp.readCheckpoint(ARGS);
    expect(back?.completedPhases).toEqual(["scrape"]);
    expect(back?.completedScrapeEntries).toEqual(["bfi"]);
  });

  it("returns null when no checkpoint exists", async () => {
    const cp = await loadModule();
    expect(await cp.readCheckpoint(ARGS)).toBeNull();
  });

  it("rejects a checkpoint older than 24h", async () => {
    const cp = await loadModule();
    await cp.initCheckpoint("run-1", ARGS);
    await cp.markPhaseComplete("preflight");
    // Backdate the persisted file by 25 hours.
    const raw = JSON.parse(await fs.readFile(CHECKPOINT_FILE, "utf8"));
    raw.startedAt = new Date(Date.now() - 25 * 3600_000).toISOString();
    await fs.writeFile(CHECKPOINT_FILE, JSON.stringify(raw));

    expect(await cp.readCheckpoint(ARGS)).toBeNull();
  });

  it("rejects a checkpoint written by a run with different args", async () => {
    const cp = await loadModule();
    await cp.initCheckpoint("run-1", { ...ARGS, skipEnrich: true });
    await cp.markPhaseComplete("preflight");

    expect(await cp.readCheckpoint(ARGS)).toBeNull();
    expect(await cp.readCheckpoint({ ...ARGS, skipEnrich: true })).not.toBeNull();
  });

  it("rejects a malformed checkpoint file", async () => {
    const cp = await loadModule();
    await fs.mkdir(join(TEST_ROOT, "tmp"), { recursive: true });
    await fs.writeFile(CHECKPOINT_FILE, '{"runId": "x"}');
    expect(await cp.readCheckpoint(ARGS)).toBeNull();
  });

  it("carries completed lists over when resuming, under the new runId", async () => {
    const cp = await loadModule();
    await cp.initCheckpoint("run-1", ARGS);
    await cp.markPhaseComplete("preflight");
    await cp.markScrapeEntryComplete("bfi");

    const prior = await cp.readCheckpoint(ARGS);
    await cp.initCheckpoint("run-2", ARGS, prior);

    const back = await cp.readCheckpoint(ARGS);
    expect(back?.runId).toBe("run-2");
    expect(back?.completedPhases).toEqual(["preflight"]);
    expect(back?.completedScrapeEntries).toEqual(["bfi"]);
  });

  it("honoredPhasePrefix only honors completions up to the first gap in the dependency chain", async () => {
    const { honoredPhasePrefix } = await loadModule();
    const seq = ["scrape", "lcut", "cleanup", "audit"] as const;

    // Scrape failed but cleanup/audit "completed" (against stale data) —
    // nothing may be skipped on resume.
    expect(honoredPhasePrefix([...seq], ["cleanup", "audit"])).toEqual([]);
    // Contiguous prefix is honored; the gap (cleanup) invalidates audit too.
    expect(honoredPhasePrefix([...seq], ["scrape", "lcut", "audit"])).toEqual(["scrape", "lcut"]);
    // Full completion honored in full.
    expect(honoredPhasePrefix([...seq], ["scrape", "lcut", "cleanup", "audit"])).toEqual([
      "scrape",
      "lcut",
      "cleanup",
      "audit",
    ]);
    // Empty cases.
    expect(honoredPhasePrefix([...seq], [])).toEqual([]);
    expect(honoredPhasePrefix([], ["scrape"])).toEqual([]);
  });

  it("clearCheckpoint removes the file", async () => {
    const cp = await loadModule();
    await cp.initCheckpoint("run-1", ARGS);
    await cp.clearCheckpoint();
    expect(await cp.readCheckpoint(ARGS)).toBeNull();
    // Marks after clear are no-ops, not resurrections.
    await cp.markPhaseComplete("scrape");
    expect(await cp.readCheckpoint(ARGS)).toBeNull();
  });
});
