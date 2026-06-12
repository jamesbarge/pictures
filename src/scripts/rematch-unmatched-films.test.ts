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

import {
  sanitizeYearHint,
  resolveYearHint,
  isSuspectedNonFilm,
  pickDominantExactTitleMatch,
} from "./rematch-unmatched-films";

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

describe("pickDominantExactTitleMatch", () => {
  const CURRENT_YEAR = 2026;

  function result(overrides: Partial<import("@/lib/tmdb/types").TMDBSearchResult>) {
    return {
      id: 0,
      title: "",
      original_title: "",
      overview: "",
      release_date: "",
      poster_path: null,
      backdrop_path: null,
      vote_average: 0,
      genre_ids: [],
      original_language: "en",
      adult: false,
      popularity: 0,
      ...overrides,
    };
  }

  it("picks the dominant exact-title classic (the Aliens anchor shape)", () => {
    const results = [
      result({ id: 679, title: "Aliens", release_date: "1986-07-18", popularity: 120 }),
      result({ id: 348, title: "Alien", release_date: "1979-05-25", popularity: 110 }),
      result({ id: 945961, title: "Alien: Romulus", release_date: "2024-08-13", popularity: 90 }),
    ];
    expect(pickDominantExactTitleMatch("Aliens", results, CURRENT_YEAR)).toEqual({
      tmdbId: 679,
      year: 1986,
    });
  });

  it("requires STRICT title equality — franchise siblings are not exact matches", () => {
    const results = [
      result({ id: 348, title: "Alien", release_date: "1979-05-25", popularity: 110 }),
      result({ id: 945961, title: "Alien: Romulus", release_date: "2024-08-13", popularity: 90 }),
    ];
    expect(pickDominantExactTitleMatch("Aliens", results, CURRENT_YEAR)).toBeNull();
  });

  it("matches on original_title too", () => {
    const results = [
      result({
        id: 426,
        title: "Queen Margot",
        original_title: "La Reine Margot",
        release_date: "1994-05-13",
        popularity: 15,
      }),
    ];
    expect(pickDominantExactTitleMatch("La Reine Margot", results, CURRENT_YEAR)).toEqual({
      tmdbId: 426,
      year: 1994,
    });
  });

  it("refuses ambiguous same-title pairs without 5x dominance (the Dracula trap)", () => {
    const results = [
      result({ id: 1, title: "Dracula", release_date: "2025-05-30", popularity: 60 }),
      result({ id: 2, title: "Dracula", release_date: "2024-11-01", popularity: 25 }),
    ];
    expect(pickDominantExactTitleMatch("Dracula", results, CURRENT_YEAR)).toBeNull();
  });

  it("rejects current/future-year candidates (year discipline)", () => {
    const results = [
      result({ id: 3, title: "Akira", release_date: "2026-03-01", popularity: 50 }),
    ];
    expect(pickDominantExactTitleMatch("Akira", results, CURRENT_YEAR)).toBeNull();
  });

  it("rejects low-popularity stubs", () => {
    const results = [
      result({ id: 4, title: "Light Industry", release_date: "2011-01-01", popularity: 0.4 }),
    ];
    expect(pickDominantExactTitleMatch("Light Industry", results, CURRENT_YEAR)).toBeNull();
  });

  it("ignores adult results and entries without release dates", () => {
    const results = [
      result({ id: 5, title: "Aliens", release_date: "1986-07-18", popularity: 80, adult: true }),
      result({ id: 6, title: "Aliens", release_date: "", popularity: 70 }),
    ];
    expect(pickDominantExactTitleMatch("Aliens", results, CURRENT_YEAR)).toBeNull();
  });
});

describe("pickDominantExactTitleMatch — punctuation folding", () => {
  it('treats TMDB\'s "Adaptation." as an exact match for "Adaptation"', () => {
    const results = [
      {
        id: 2757,
        title: "Adaptation.",
        original_title: "Adaptation.",
        overview: "",
        release_date: "2002-12-06",
        poster_path: null,
        backdrop_path: null,
        vote_average: 7.5,
        genre_ids: [],
        original_language: "en",
        adult: false,
        popularity: 30,
      },
    ];
    expect(pickDominantExactTitleMatch("Adaptation", results, 2026)).toEqual({
      tmdbId: 2757,
      year: 2002,
    });
  });
});

describe("resolveYearHint", () => {
  const CURRENT_YEAR = 2026;

  it("prefers a sane film.year over the extracted year", () => {
    expect(resolveYearHint(1977, 2001, CURRENT_YEAR)).toBe(1977);
  });

  it("falls through to extractedYear when film.year is polluted (review blocker)", () => {
    // Screening-year pollution on the row must not shadow a valid title year:
    // "Suspiria (1977)" with row year 2026 should hint 1977, not nothing.
    expect(resolveYearHint(2026, 1977, CURRENT_YEAR)).toBe(1977);
  });

  it("returns undefined when both candidates are unusable", () => {
    expect(resolveYearHint(2026, 2026, CURRENT_YEAR)).toBeUndefined();
    expect(resolveYearHint(null, undefined, CURRENT_YEAR)).toBeUndefined();
  });
});
