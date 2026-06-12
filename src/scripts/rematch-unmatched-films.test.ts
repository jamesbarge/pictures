/**
 * Tests for the pure helpers in the rematch sweep (plan 008, step 3).
 * The DB/TMDB orchestration is exercised via the script's default-dry run
 * against production data; only the pure classification logic is unit-tested.
 */
import { describe, expect, it, vi } from "vitest";

// The script module imports @/db and @/lib/tmdb at top level — stub them so
// importing the helpers never touches a database or the network.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/tmdb", () => ({
  matchFilmToTMDB: vi.fn(),
  getTMDBClient: vi.fn(),
  isRepertoryFilm: vi.fn(),
  getDecade: vi.fn(),
}));

import { sanitizeYearHint, isSuspectedNonFilm } from "./rematch-unmatched-films";

describe("sanitizeYearHint", () => {
  const CURRENT_YEAR = 2026;

  it("accepts a sane past year", () => {
    expect(sanitizeYearHint(1986, CURRENT_YEAR)).toBe(1986);
    expect(sanitizeYearHint(2025, CURRENT_YEAR)).toBe(2025);
  });

  it("rejects the current year (screening-year / re-release pollution)", () => {
    expect(sanitizeYearHint(2026, CURRENT_YEAR)).toBeUndefined();
  });

  it("rejects future years", () => {
    expect(sanitizeYearHint(2030, CURRENT_YEAR)).toBeUndefined();
  });

  it("rejects pre-1900 and missing years", () => {
    expect(sanitizeYearHint(1899, CURRENT_YEAR)).toBeUndefined();
    expect(sanitizeYearHint(0, CURRENT_YEAR)).toBeUndefined();
    expect(sanitizeYearHint(null, CURRENT_YEAR)).toBeUndefined();
    expect(sanitizeYearHint(undefined, CURRENT_YEAR)).toBeUndefined();
  });
});

describe("isSuspectedNonFilm", () => {
  it("flags audit non-film patterns (quiz nights etc.)", () => {
    expect(isSuspectedNonFilm("Picturehouse Quiz Night", "Picturehouse Quiz Night")).toContain(
      "non-film pattern",
    );
  });

  it("flags live-broadcast keywords", () => {
    expect(isSuspectedNonFilm("NT Live: Hamlet", "Hamlet")).toContain("live-broadcast keyword");
    expect(isSuspectedNonFilm("Met Opera: Tosca", "Tosca")).toContain("live-broadcast keyword");
  });

  it("checks the RAW title too, even when the cleaner stripped the signal", () => {
    // Cleaned title looks like a film, but the raw title carries the signal.
    expect(isSuspectedNonFilm("Royal Ballet: Giselle", "Giselle")).toContain(
      "live-broadcast keyword",
    );
  });

  it("passes ordinary film titles through", () => {
    expect(isSuspectedNonFilm("Aliens", "Aliens")).toBeNull();
    expect(isSuspectedNonFilm("Adaptation", "Adaptation")).toBeNull();
    expect(isSuspectedNonFilm("CAMP CLASSICS presents Barbarella", "Barbarella")).toBeNull();
  });
});
