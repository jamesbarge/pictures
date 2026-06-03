/**
 * Tests for src/lib/title-extraction/index.ts — the title-cache module.
 *
 * Tests the cache + clear + batch primitives, NOT the underlying extractor
 * (which has its own tests in ai-extractor.test.ts).
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  batchExtractTitles,
  clearTitleCache,
  extractFilmTitle,
  extractFilmTitleCached,
} from "./index";

describe("extractFilmTitle", () => {
  it("returns an AIExtractionResult for a plain film title (sync extractor under the hood)", async () => {
    const result = await extractFilmTitle("Vertigo");
    // AIExtractionResult shape: { filmTitle, canonicalTitle, confidence: "high" | "medium" | "low" }
    expect(result.filmTitle).toBe("Vertigo");
    expect(["high", "medium", "low"]).toContain(result.confidence);
  });
});

describe("extractFilmTitleCached", () => {
  afterEach(() => {
    clearTitleCache();
  });

  it("returns identical reference on cache hit (same string → same AIExtractionResult instance)", async () => {
    const first = await extractFilmTitleCached("Fight Club");
    const second = await extractFilmTitleCached("Fight Club");
    // The cache stores the result object directly — should be reference-equal.
    expect(second).toBe(first);
  });

  it("treats different titles as different cache keys (no false hits)", async () => {
    const a = await extractFilmTitleCached("Fight Club");
    const b = await extractFilmTitleCached("Citizen Kane");
    expect(a).not.toBe(b);
    expect(a.filmTitle).toBe("Fight Club");
    expect(b.filmTitle).toBe("Citizen Kane");
  });

  it("cache is case-sensitive on the raw input (different cases → different cache entries)", async () => {
    const lower = await extractFilmTitleCached("vertigo");
    const upper = await extractFilmTitleCached("Vertigo");
    // Pin the contract: cache key is the RAW input string, not normalised.
    expect(lower).not.toBe(upper);
  });
});

describe("clearTitleCache", () => {
  it("invalidates the cache so the next call returns a fresh instance", async () => {
    const before = await extractFilmTitleCached("Saint Maud");
    clearTitleCache();
    const after = await extractFilmTitleCached("Saint Maud");
    // Same value but different object reference — cache was cleared.
    expect(after).not.toBe(before);
    expect(after.filmTitle).toBe(before.filmTitle);
  });
});

describe("batchExtractTitles", () => {
  it("returns a Map keyed by raw title with one entry per unique input", async () => {
    const result = await batchExtractTitles(["A", "B", "A", "C"]);
    expect(result.size).toBe(3);
    expect(result.has("A")).toBe(true);
    expect(result.has("B")).toBe(true);
    expect(result.has("C")).toBe(true);
  });

  it("handles an empty input array", async () => {
    const result = await batchExtractTitles([]);
    expect(result.size).toBe(0);
  });

  it("preserves the original title in each entry's AIExtractionResult", async () => {
    const result = await batchExtractTitles(["Vertigo", "The Shining"]);
    expect(result.get("Vertigo")?.filmTitle).toBe("Vertigo");
    expect(result.get("The Shining")?.filmTitle).toBe("The Shining");
  });

  it("deduplicates via Set before processing (only one result per unique title)", async () => {
    const titles = ["A", "A", "A", "A"];
    const result = await batchExtractTitles(titles);
    expect(result.size).toBe(1);
  });
});
