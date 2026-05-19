/**
 * Tests for `cosineSimilarity` from src/lib/embeddings.ts.
 *
 * Separate test file (rather than embeddings.test.ts) because the rest of
 * the embeddings module talks to Ollama and would pull in network mocks.
 * This file tests only the pure-math export.
 */
import { describe, expect, it } from "vitest";
import { cosineSimilarity, SIMILARITY_THRESHOLDS } from "./embeddings";

describe("cosineSimilarity", () => {
  it("returns 1 for identical unit vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBe(1);
  });

  it("returns 1 for identical non-unit vectors (scale-invariant)", () => {
    expect(cosineSimilarity([3, 4], [3, 4])).toBe(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("returns -1 for opposite-direction vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(-1);
  });

  it("is scale-invariant (multiplying one vector by a positive constant doesn't change similarity)", () => {
    const a = [1, 2, 3];
    const b = [2, 4, 6];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 10);
  });

  it("is symmetric: sim(a, b) === sim(b, a)", () => {
    const a = [1, 2, 3, 4];
    const b = [4, 3, 2, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it("returns 0 when one vector is all zeros (degenerate norm guard)", () => {
    // Without the `if (normA === 0 || normB === 0) return 0` guard this would
    // divide by zero and return NaN. Pinning the safe fallback.
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("returns 0 when both vectors are all zeros", () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it("returns a value in [-1, 1] for arbitrary inputs", () => {
    const a = [0.1, -0.5, 0.7, 0.3];
    const b = [0.4, 0.2, -0.1, 0.8];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThanOrEqual(-1);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it("throws on vector length mismatch (with both lengths in message)", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/2 vs 3/);
  });

  it("works on bge-m3-sized 1024-dimensional vectors", () => {
    // Sanity check: doesn't blow up on the actual production vector size.
    const a = new Array(1024).fill(0).map((_, i) => Math.sin(i));
    const b = new Array(1024).fill(0).map((_, i) => Math.sin(i + 0.1));
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.9); // small shift, high similarity
    expect(sim).toBeLessThan(1);
  });
});

describe("SIMILARITY_THRESHOLDS", () => {
  it("has the expected band structure: autoMerge >= judgeBand >= doNotMerge", () => {
    expect(SIMILARITY_THRESHOLDS.autoMerge).toBeGreaterThanOrEqual(
      SIMILARITY_THRESHOLDS.judgeBand,
    );
    expect(SIMILARITY_THRESHOLDS.judgeBand).toBeGreaterThanOrEqual(
      SIMILARITY_THRESHOLDS.doNotMerge,
    );
  });

  it("all thresholds are valid cosine similarities in [0, 1]", () => {
    for (const key of Object.keys(SIMILARITY_THRESHOLDS) as Array<
      keyof typeof SIMILARITY_THRESHOLDS
    >) {
      const v = SIMILARITY_THRESHOLDS[key];
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
