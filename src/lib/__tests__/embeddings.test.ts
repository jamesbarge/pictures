import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  SIMILARITY_THRESHOLDS,
  judgeMatchCandidates,
} from "../embeddings";

describe("embeddings: cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("returns -1 for opposing vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  it("returns 0 if either vector is all zeros (avoids NaN)", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it("throws on length mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/length mismatch/);
  });

  it("is symmetric", () => {
    const a = [0.1, 0.5, -0.3, 0.8];
    const b = [0.4, -0.2, 0.7, 0.1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 9);
  });
});

describe("embeddings: SIMILARITY_THRESHOLDS", () => {
  it("auto-merge threshold is stricter than judge-band threshold", () => {
    expect(SIMILARITY_THRESHOLDS.autoMerge).toBeGreaterThan(
      SIMILARITY_THRESHOLDS.judgeBand,
    );
  });
});

describe("embeddings: judgeMatchCandidates (stub)", () => {
  it("returns null to defer to existing heuristic until wired up", async () => {
    const result = await judgeMatchCandidates({
      rawTitle: "Member Picks: Daisies",
      cinemaId: "bfi-southbank",
      candidates: [
        {
          tmdbId: 46919,
          title: "Daisies",
          year: 1966,
          director: "Věra Chytilová",
          popularity: 7.5,
          similarityScore: 0.88,
        },
      ],
    });
    expect(result).toBeNull();
  });
});
