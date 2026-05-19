/**
 * Tests for the pure helper functions in src/lib/tmdb/match.ts.
 *
 * Skips the big `matchTitle` function — it has DB + ambiguity + Levenshtein
 * dependencies and warrants its own integration tests. This file covers
 * the small standalone helpers only.
 */
import { describe, expect, it } from "vitest";
import { getDecade, isRepertoryFilm } from "./match";

describe("isRepertoryFilm", () => {
  it("returns false for undefined release date", () => {
    expect(isRepertoryFilm(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isRepertoryFilm("")).toBe(false);
  });

  it("returns true for clearly old films (e.g. 1958 Vertigo)", () => {
    expect(isRepertoryFilm("1958-05-09")).toBe(true);
  });

  it("returns false for current-year films", () => {
    const thisYear = new Date().getFullYear();
    expect(isRepertoryFilm(`${thisYear}-01-01`)).toBe(false);
  });

  it("returns false for last-year films (within the 2-year cutoff)", () => {
    const lastYear = new Date().getFullYear() - 1;
    expect(isRepertoryFilm(`${lastYear}-06-01`)).toBe(false);
  });

  it("parses year from yyyy-MM-dd format (slices at first '-')", () => {
    // The implementation does `releaseDate.split("-")[0]` → first token only.
    expect(isRepertoryFilm("1980-12-31")).toBe(true);
  });

  it("handles year-only strings", () => {
    expect(isRepertoryFilm("1980")).toBe(true);
  });

  it("returns false for unparseable date strings (NaN year)", () => {
    // parseInt("garbage", 10) → NaN, NaN < anything → false.
    expect(isRepertoryFilm("not-a-date")).toBe(false);
  });
});

describe("getDecade", () => {
  it("formats 1958 as '1950s'", () => {
    expect(getDecade(1958)).toBe("1950s");
  });

  it("formats 2024 as '2020s'", () => {
    expect(getDecade(2024)).toBe("2020s");
  });

  it("formats year-0 of a decade correctly (1980 → 1980s)", () => {
    expect(getDecade(1980)).toBe("1980s");
  });

  it("formats year-9 of a decade correctly (1989 → 1980s)", () => {
    expect(getDecade(1989)).toBe("1980s");
  });

  it("handles edge of millennium (2000 → 2000s)", () => {
    expect(getDecade(2000)).toBe("2000s");
  });

  it("handles years before 1900 (1899 → 1890s)", () => {
    expect(getDecade(1899)).toBe("1890s");
  });
});
