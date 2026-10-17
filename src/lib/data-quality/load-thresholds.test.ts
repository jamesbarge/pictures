import { describe, expect, it } from "vitest";
import { loadThresholds } from "./load-thresholds";

describe("loadThresholds", () => {
  it("returns the full Thresholds shape", () => {
    const t = loadThresholds();
    expect(t.tmdb).toBeDefined();
    expect(t.duplicateDetection).toBeDefined();
    expect(t.dodgyDetection).toBeDefined();
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
    const t = loadThresholds() as unknown as Record<string, unknown>;
    expect(t.$comment).toBeUndefined();
  });
});
