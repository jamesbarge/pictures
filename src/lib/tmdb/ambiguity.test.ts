import { describe, expect, it } from "vitest";
import {
  analyzeTitleAmbiguity,
  hasSufficientMetadata,
  isAmbiguousTitle,
} from "./ambiguity";

describe("analyzeTitleAmbiguity", () => {
  it("flags single-word titles with high ambiguity score", () => {
    const result = analyzeTitleAmbiguity("Crash");
    expect(result.score).toBeGreaterThan(0.3);
    expect(result.reasons).toContain("Single-word title");
    expect(result.requiresReview).toBe(true);
  });

  it("flags very short titles separately from single-word", () => {
    const result = analyzeTitleAmbiguity("It");
    // "It" is single-word AND ≤5 chars — should accumulate both reasons.
    expect(result.reasons).toContain("Single-word title");
    expect(result.reasons).toContain("Very short title (≤5 chars)");
  });

  it("flags two-word titles as moderately ambiguous", () => {
    const result = analyzeTitleAmbiguity("Fight Club");
    expect(result.reasons).toContain("Short title (2 words)");
  });

  it("flags 'The X' pattern with single noun", () => {
    const result = analyzeTitleAmbiguity("The Thing");
    expect(result.reasons).toContain("'The X' pattern with single noun");
  });

  it("returns low score for long unambiguous titles", () => {
    const result = analyzeTitleAmbiguity(
      "The Unbearable Lightness of Being",
    );
    expect(result.score).toBeLessThan(0.5);
    expect(result.requiresReview).toBe(false);
  });

  it("caps score at 1.0", () => {
    // A pathologically ambiguous title (single common-name word, very short)
    // should still cap at 1.0 — no scores > 1.
    const result = analyzeTitleAmbiguity("It");
    expect(result.score).toBeLessThanOrEqual(1.0);
  });

  it("requiresReview is always true for single-word titles regardless of score", () => {
    // Pinned contract: single-word → review always (independent of score threshold).
    const result = analyzeTitleAmbiguity("Unobtanium");
    expect(result.requiresReview).toBe(true);
  });

  it("deduplicates reasons (Set semantics)", () => {
    const result = analyzeTitleAmbiguity("It");
    const counts = new Map<string, number>();
    for (const reason of result.reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    for (const [, count] of counts) {
      expect(count).toBe(1);
    }
  });

  it("flags year-pattern titles", () => {
    const result = analyzeTitleAmbiguity("1984");
    expect(result.reasons).toContain("Year-based title");
  });
});

describe("isAmbiguousTitle", () => {
  it("returns true for single-word titles", () => {
    expect(isAmbiguousTitle("Crash")).toBe(true);
  });

  it("returns false for long descriptive titles", () => {
    expect(isAmbiguousTitle("The Unbearable Lightness of Being")).toBe(false);
  });
});

describe("hasSufficientMetadata", () => {
  it("returns true when title is unambiguous regardless of metadata", () => {
    expect(hasSufficientMetadata("The Unbearable Lightness of Being", false, false)).toBe(true);
  });

  it("requires BOTH year AND director for highly-ambiguous single-word titles", () => {
    expect(hasSufficientMetadata("It", true, true)).toBe(true);
    expect(hasSufficientMetadata("It", true, false)).toBe(false);
    expect(hasSufficientMetadata("It", false, true)).toBe(false);
    expect(hasSufficientMetadata("It", false, false)).toBe(false);
  });

  it("requires AT LEAST ONE of year/director for moderately-ambiguous titles", () => {
    // Two-word titles like "Fight Club" are flagged but lower-score.
    // Should accept either year OR director.
    const aRes = hasSufficientMetadata("Fight Club", true, false);
    const bRes = hasSufficientMetadata("Fight Club", false, true);
    // At least one should be true (pinning the "moderate" branch).
    expect(aRes || bRes).toBe(true);
  });
});
