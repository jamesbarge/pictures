import { describe, it, expect } from "vitest";
import { trigramThresholdFor, violatesYearWindow } from "./film-similarity";

/**
 * Film similarity helpers — pure-function tests.
 *
 * Integration of findMatchingFilm() against the live DB is exercised
 * during scrape runs; these tests pin the matcher's secondary-signal
 * logic so threshold tuning has a quick safety net.
 */

describe("trigramThresholdFor", () => {
  describe("short titles need a higher bar", () => {
    // "The Thin Man" / "The Third Man" both score 64% — must be rejected.
    it.each([
      ["1 word", 1, 0.78],
      ["2 words", 2, 0.78],
      ["3 words", 3, 0.78],
    ])("%s requires ≥0.78", (_label, words, expected) => {
      expect(trigramThresholdFor(words)).toBe(expected);
    });
  });

  describe("medium-length titles", () => {
    it.each([
      ["4 words", 4, 0.7],
      ["5 words", 5, 0.7],
    ])("%s requires ≥0.70", (_label, words, expected) => {
      expect(trigramThresholdFor(words)).toBe(expected);
    });
  });

  describe("long titles tolerate looser similarity", () => {
    it.each([
      ["6 words", 6, 0.6],
      ["10 words", 10, 0.6],
    ])("%s requires ≥0.60", (_label, words, expected) => {
      expect(trigramThresholdFor(words)).toBe(expected);
    });
  });
});

describe("violatesYearWindow", () => {
  describe("rejects when both sides have years and delta > 5", () => {
    // The Thin Man (1934) vs The Third Man (1949) — 15-year gap, must reject.
    it("1934 vs 1949 → rejects", () => {
      expect(violatesYearWindow(1934, 1949)).toBe(true);
    });

    // The Awful Truth (1937) vs The Truth (2019) — 82-year gap, definitely reject.
    it("1937 vs 2019 → rejects", () => {
      expect(violatesYearWindow(1937, 2019)).toBe(true);
    });

    // The Truth (1960) vs The Truth (2019) — 59-year gap, also different films.
    it("1960 vs 2019 → rejects", () => {
      expect(violatesYearWindow(1960, 2019)).toBe(true);
    });
  });

  describe("permits when delta ≤ 5", () => {
    // Re-releases / restorations sometimes carry a different "year" tag.
    it("1972 vs 1973 → permits (1-year delta)", () => {
      expect(violatesYearWindow(1972, 1973)).toBe(false);
    });

    it("1980 vs 1985 → permits (5-year delta)", () => {
      expect(violatesYearWindow(1980, 1985)).toBe(false);
    });

    it("identical year → permits", () => {
      expect(violatesYearWindow(1972, 1972)).toBe(false);
    });
  });

  describe("permissive when one or both sides lack a year", () => {
    // Common for repertory listings — don't punish missing data.
    it("source year missing → permits", () => {
      expect(violatesYearWindow(undefined, 1972)).toBe(false);
      expect(violatesYearWindow(null, 1972)).toBe(false);
    });

    it("candidate year missing → permits", () => {
      expect(violatesYearWindow(1972, null)).toBe(false);
    });

    it("both missing → permits", () => {
      expect(violatesYearWindow(undefined, null)).toBe(false);
      expect(violatesYearWindow(null, null)).toBe(false);
    });
  });
});
