import { describe, expect, it } from "vitest";
import { levenshteinDistance, levenshteinSimilarity } from "./levenshtein";

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
  });

  it("returns 0 for two empty strings", () => {
    expect(levenshteinDistance("", "")).toBe(0);
  });

  it("returns the length of the other string when one is empty", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("counts a single substitution as distance 1", () => {
    expect(levenshteinDistance("cat", "bat")).toBe(1);
  });

  it("counts a single insertion as distance 1", () => {
    expect(levenshteinDistance("cat", "cats")).toBe(1);
  });

  it("counts a single deletion as distance 1", () => {
    expect(levenshteinDistance("cats", "cat")).toBe(1);
  });

  it("computes the classic kitten/sitting distance of 3", () => {
    // kitten → sitten (sub k→s) → sittin (sub e→i) → sitting (ins g)
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("is symmetric", () => {
    expect(levenshteinDistance("Saturday", "Sunday")).toBe(
      levenshteinDistance("Sunday", "Saturday"),
    );
  });

  it("is case-sensitive", () => {
    // No case folding happens inside the function — callers must lowercase first.
    expect(levenshteinDistance("hello", "Hello")).toBe(1);
  });

  it("treats unicode characters as code units (not code points)", () => {
    // JS string `.length` and `.charAt` count UTF-16 code units, so a surrogate
    // pair like 🎬 (U+1F3AC) counts as 2 chars. This test pins the current
    // (load-bearing) behaviour so callers know what to expect when comparing
    // titles that may contain emoji or astral-plane characters.
    expect("🎬".length).toBe(2);
    expect(levenshteinDistance("🎬", "")).toBe(2);
  });

  it("handles long inputs without overflow", () => {
    // Indirectly verifies the algorithm doesn't blow up at non-trivial sizes.
    const a = "a".repeat(200);
    const b = "b".repeat(200);
    expect(levenshteinDistance(a, b)).toBe(200);
  });
});

describe("levenshteinSimilarity", () => {
  it("returns 1 for two identical strings", () => {
    expect(levenshteinSimilarity("hello", "hello")).toBe(1);
  });

  it("returns 1 for two empty strings (defined edge case)", () => {
    // Both inputs empty → maxLen === 0; the guard short-circuits to 1.
    expect(levenshteinSimilarity("", "")).toBe(1);
  });

  it("returns 0 for an empty string against any non-empty string", () => {
    // distance === maxLen ⇒ 1 - 1 = 0.
    expect(levenshteinSimilarity("", "abc")).toBe(0);
    expect(levenshteinSimilarity("abc", "")).toBe(0);
  });

  it("returns a value between 0 and 1 for partial matches", () => {
    const score = levenshteinSimilarity("kitten", "sitting");
    // 1 - 3/7 ≈ 0.571
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
    expect(score).toBeCloseTo(4 / 7, 4);
  });

  it("treats one-character difference as high similarity for long strings", () => {
    // Used by callers like TMDB match.ts to rank near-duplicate film titles.
    const score = levenshteinSimilarity(
      "the lord of the rings",
      "the lord of the ring",
    );
    expect(score).toBeGreaterThan(0.95);
  });

  it("is symmetric", () => {
    expect(levenshteinSimilarity("Saturday", "Sunday")).toBe(
      levenshteinSimilarity("Sunday", "Saturday"),
    );
  });
});
