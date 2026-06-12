/**
 * scrape-progress — write resilience (plan 010, step 1)
 *
 * Two regressions guarded here:
 * 1. Fresh checkout: `tmp/` doesn't exist — the writer must create the
 *    directory (recursively) before the atomic rename.
 * 2. Concurrent stamps: scrape waves run 3-4 venues in parallel. With a
 *    single shared `.tmp` path, concurrent renames raced each other and
 *    every write failed with ENOENT (observed 2026-06-11). Temp filenames
 *    are now unique per write.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_ROOT = join(tmpdir(), `scrape-progress-test-${process.pid}-${Date.now()}`);

async function loadModule(progressFile: string) {
  vi.resetModules();
  vi.stubEnv("SCRAPE_PROGRESS_FILE", progressFile);
  return import("./scrape-progress");
}

describe("stampProgress", () => {
  beforeEach(async () => {
    await fs.rm(TEST_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await fs.rm(TEST_ROOT, { recursive: true, force: true });
  });

  it("creates a missing directory before writing (fresh checkout)", async () => {
    const progressFile = join(TEST_ROOT, "deep", "nested", "tmp", "scrape-progress.json");
    const { stampProgress, readProgress } = await loadModule(progressFile);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await stampProgress({ phase: "test", startedAt: new Date().toISOString() });

    expect(warn).not.toHaveBeenCalled();
    const snapshot = await readProgress();
    expect(snapshot?.phase).toBe("test");
  });

  it("survives concurrent writes without rename races", async () => {
    const progressFile = join(TEST_ROOT, "tmp", "scrape-progress.json");
    const { stampProgress, readProgress } = await loadModule(progressFile);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const startedAt = new Date().toISOString();
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        stampProgress({ cinemaId: `venue-${i}`, phase: "film-loop", startedAt }),
      ),
    );

    // No write may fail, the final file must be valid JSON, and no orphaned
    // temp files may be left behind.
    expect(warn).not.toHaveBeenCalled();
    const snapshot = await readProgress();
    expect(snapshot?.phase).toBe("film-loop");
    const leftovers = (await fs.readdir(join(TEST_ROOT, "tmp"))).filter((f) => f.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("recreates the directory if it is deleted mid-run", async () => {
    const progressFile = join(TEST_ROOT, "tmp", "scrape-progress.json");
    const { stampProgress, readProgress } = await loadModule(progressFile);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const startedAt = new Date().toISOString();
    await stampProgress({ phase: "first", startedAt });
    await fs.rm(join(TEST_ROOT, "tmp"), { recursive: true, force: true });

    // First stamp after deletion fails (dir memo was stale) but resets the
    // memo; the next one must succeed again.
    await stampProgress({ phase: "second", startedAt });
    await stampProgress({ phase: "third", startedAt });

    const snapshot = await readProgress();
    expect(snapshot?.phase).toBe("third");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
