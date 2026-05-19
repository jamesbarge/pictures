import { describe, expect, it } from "vitest";
import { loadThresholds, loadThresholdsAsync } from "./load-thresholds";

describe("loadThresholds", () => {
  it("returns the full Thresholds shape", () => {
    const t = loadThresholds();
    expect(t.tmdb).toBeDefined();
    expect(t.duplicateDetection).toBeDefined();
    expect(t.dodgyDetection).toBeDefined();
    expect(t.nonFilmDetection).toBeDefined();
    expect(t.safetyFloors).toBeDefined();
  });

  it("exposes all tmdb fields as numbers", () => {
    const { tmdb } = loadThresholds();
    expect(typeof tmdb.minTitleSimilarity).toBe("number");
    expect(typeof tmdb.titleSimilarityWeight).toBe("number");
    expect(typeof tmdb.competitorThresholdRatio).toBe("number");
    expect(typeof tmdb.minMatchConfidence).toBe("number");
    expect(typeof tmdb.yearMatchPenaltyRecovery).toBe("number");
  });

  it("exposes dodgy detection bounds as numbers in plausible ranges", () => {
    const { dodgyDetection } = loadThresholds();
    expect(dodgyDetection.maxTitleLength).toBeGreaterThan(0);
    expect(dodgyDetection.minYear).toBeGreaterThan(1800);
    expect(dodgyDetection.maxYear).toBeGreaterThan(dodgyDetection.minYear);
    expect(dodgyDetection.maxRuntime).toBeGreaterThan(0);
  });

  it("returns identical reference on repeated calls (cached module-scope value)", () => {
    // Reading thresholds at runtime would risk inconsistent reads if the JSON
    // were dynamically loaded; pinning the module-scope caching contract.
    expect(loadThresholds()).toBe(loadThresholds());
  });

  it("strips the `$comment` field from the JSON-loaded object", () => {
    // The implementation explicitly does `delete copy.$comment` so callers
    // don't see the JSON metadata field as a Thresholds property.
    const t = loadThresholds() as Record<string, unknown>;
    expect(t.$comment).toBeUndefined();
  });

  it("safetyFloors values are in [0,1] range (similarities) or sensible positives (counts)", () => {
    const { safetyFloors } = loadThresholds();
    expect(safetyFloors.minAutoMergeSimilarity).toBeGreaterThanOrEqual(0);
    expect(safetyFloors.minAutoMergeSimilarity).toBeLessThanOrEqual(1);
    expect(safetyFloors.minTmdbConfidence).toBeGreaterThanOrEqual(0);
    expect(safetyFloors.minTmdbConfidence).toBeLessThanOrEqual(1);
    expect(safetyFloors.maxNewNonFilmPatterns).toBeGreaterThan(0);
  });
});

describe("loadThresholdsAsync", () => {
  it("resolves with the same value as the synchronous variant", async () => {
    const sync = loadThresholds();
    const asyncResult = await loadThresholdsAsync();
    expect(asyncResult).toBe(sync);
  });

  it("never throws (no I/O under the hood since module-scope load)", async () => {
    // Pinning: a future refactor adding I/O back must NOT silently change
    // the throw semantics that callers depend on.
    await expect(loadThresholdsAsync()).resolves.toBeDefined();
  });
});
