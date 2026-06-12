/**
 * Tests for matchFilmToTMDB / findBestMatch in src/lib/tmdb/match.ts.
 *
 * Mocks the TMDB client (no live API calls) and the blocklist. Covers
 * plan 005 signals:
 *  - Step 3: runtime cross-check (stub-reject / penalty / pass-through,
 *    gated so no extra API call without a runtime hint)
 *  - Step 4: director credit tie-break for close competitors
 *  - Step 5: venue original-language prior
 *  - Regression: title+year scoring behaviour unchanged when no new hints
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TMDBSearchResult } from "./types";

const mocks = vi.hoisted(() => ({
  searchFilms: vi.fn(),
  getFilmDetails: vi.fn(),
  findDirectorId: vi.fn(),
  getPersonCredits: vi.fn(),
}));

vi.mock("./client", () => ({
  getTMDBClient: () => ({
    searchFilms: mocks.searchFilms,
    getFilmDetails: mocks.getFilmDetails,
    findDirectorId: mocks.findDirectorId,
    getPersonCredits: mocks.getPersonCredits,
  }),
}));

vi.mock("./blocklist", () => ({
  getBlockedTmdbIds: () => new Set<number>(),
  checkTitleBlocklist: () => null,
  incrementBlocklistUsage: vi.fn(),
}));

import { matchFilmToTMDB } from "./match";

function makeResult(overrides: Partial<TMDBSearchResult> = {}): TMDBSearchResult {
  return {
    id: 1,
    title: "Joyland",
    original_title: "Joyland",
    release_date: "2022-11-18",
    poster_path: "/p.jpg",
    backdrop_path: null,
    overview: "",
    popularity: 10,
    vote_average: 7,
    vote_count: 100,
    genre_ids: [],
    original_language: "ur",
    adult: false,
    video: false,
    ...overrides,
  } as TMDBSearchResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchFilms.mockResolvedValue({ results: [] });
});

describe("matchFilmToTMDB — runtime cross-check (step 3)", () => {
  it("rejects a stub candidate (runtime 0) when the venue says it is a feature", async () => {
    mocks.searchFilms.mockResolvedValue({ results: [makeResult({ id: 11 })] });
    mocks.getFilmDetails.mockResolvedValue({ runtime: 0 });

    const match = await matchFilmToTMDB("Joyland", { year: 2022, runtime: 100 });

    expect(mocks.getFilmDetails).toHaveBeenCalledWith(11);
    expect(match).toBeNull();
  });

  it("rejects a short (runtime 12) when the venue says it is a feature", async () => {
    mocks.searchFilms.mockResolvedValue({ results: [makeResult({ id: 11 })] });
    mocks.getFilmDetails.mockResolvedValue({ runtime: 12 });

    const match = await matchFilmToTMDB("Joyland", { year: 2022, runtime: 100 });

    expect(match).toBeNull();
  });

  it("passes a close runtime through unchanged", async () => {
    mocks.searchFilms.mockResolvedValue({ results: [makeResult({ id: 11 })] });

    const control = await matchFilmToTMDB("Joyland", { year: 2022 });

    mocks.getFilmDetails.mockResolvedValue({ runtime: 97 });
    const match = await matchFilmToTMDB("Joyland", { year: 2022, runtime: 100 });

    expect(match).not.toBeNull();
    expect(match!.confidence).toBeCloseTo(control!.confidence, 10);
  });

  it("keeps the match when the runtime-check getFilmDetails call fails", async () => {
    // A transient TMDB failure must skip verification, not convert a
    // successful match into a TMDB-less film via the pipeline fallback.
    mocks.searchFilms.mockResolvedValue({ results: [makeResult({ id: 11 })] });
    mocks.getFilmDetails.mockRejectedValue(new Error("TMDB API error: 503"));

    const match = await matchFilmToTMDB("Joyland", { year: 2022, runtime: 100 });

    expect(match).not.toBeNull();
    expect(match!.tmdbId).toBe(11);
  });

  it("applies a -0.15 penalty when runtimes differ by more than 30 minutes", async () => {
    // Nosferatu 2024 (131 min) vs the venue's 1922 original (97 min)
    mocks.searchFilms.mockResolvedValue({ results: [makeResult({ id: 11 })] });

    const control = await matchFilmToTMDB("Joyland", { year: 2022 });

    mocks.getFilmDetails.mockResolvedValue({ runtime: 131 });
    const match = await matchFilmToTMDB("Joyland", { year: 2022, runtime: 97 });

    expect(match).not.toBeNull();
    expect(match!.confidence).toBeCloseTo(control!.confidence - 0.15, 10);
  });

  it("rejects when the runtime penalty drops confidence below the floor", async () => {
    // Weak title match + no year bonus → base confidence just above 0.6;
    // −0.15 sinks it below the 0.6 floor.
    mocks.searchFilms.mockResolvedValue({
      results: [
        makeResult({
          id: 11,
          title: "Joyland Forever",
          original_title: "Joyland Forever",
          release_date: "2019-01-01",
        }),
      ],
    });
    mocks.getFilmDetails.mockResolvedValue({ runtime: 200 });

    const match = await matchFilmToTMDB("Joyland", { year: 2022, runtime: 97 });

    expect(match).toBeNull();
  });

  it("makes zero extra API calls when no runtime hint is provided", async () => {
    mocks.searchFilms.mockResolvedValue({ results: [makeResult({ id: 11 })] });

    const match = await matchFilmToTMDB("Joyland", { year: 2022 });

    expect(match).not.toBeNull();
    expect(mocks.getFilmDetails).not.toHaveBeenCalled();
  });

  it("skips the cross-check for short-programme hints (< 40 min)", async () => {
    mocks.searchFilms.mockResolvedValue({ results: [makeResult({ id: 11 })] });

    const match = await matchFilmToTMDB("Joyland", { year: 2022, runtime: 25 });

    expect(match).not.toBeNull();
    expect(mocks.getFilmDetails).not.toHaveBeenCalled();
  });

  it("leaves the match unchanged when TMDB has no runtime and the hint is sub-feature", async () => {
    // tmdbRuntime 0 with hint 45 (< 60): not a stub-vs-feature situation
    mocks.searchFilms.mockResolvedValue({ results: [makeResult({ id: 11 })] });
    mocks.getFilmDetails.mockResolvedValue({ runtime: null });

    const match = await matchFilmToTMDB("Joyland", { year: 2022, runtime: 45 });

    expect(match).not.toBeNull();
  });
});

describe("matchFilmToTMDB — director credit tie-break (step 4)", () => {
  /** Two same-title same-year candidates: the Besson (high popularity) and the Jude. */
  function draculaTie() {
    return [
      makeResult({
        id: 100,
        title: "Dracula",
        original_title: "Dracula",
        release_date: "2025-07-30",
        popularity: 900, // popularity alone would pick this one
        original_language: "en",
      }),
      makeResult({
        id: 200,
        title: "Dracula",
        original_title: "Dracula",
        release_date: "2025-07-30",
        popularity: 5,
        original_language: "ro",
      }),
    ];
  }

  it("picks the film the hinted director actually directed when candidates tie", async () => {
    mocks.searchFilms.mockResolvedValue({ results: draculaTie() });
    mocks.findDirectorId.mockResolvedValue(77);
    mocks.getPersonCredits.mockResolvedValue({
      cast: [],
      crew: [
        { id: 200, job: "Director", title: "Dracula" },
        { id: 300, job: "Writer", title: "Something Else" },
      ],
    });

    const match = await matchFilmToTMDB("Dracula", { year: 2025, director: "Radu Jude" });

    expect(mocks.findDirectorId).toHaveBeenCalledWith("Radu Jude");
    expect(match).not.toBeNull();
    expect(match!.tmdbId).toBe(200);
  });

  it("does not fetch director credits when there is a single dominant candidate", async () => {
    mocks.searchFilms.mockResolvedValue({ results: [makeResult({ id: 11 })] });

    const match = await matchFilmToTMDB("Joyland", { year: 2022, director: "Saim Sadiq" });

    expect(match).not.toBeNull();
    expect(mocks.findDirectorId).not.toHaveBeenCalled();
    expect(mocks.getPersonCredits).not.toHaveBeenCalled();
  });

  it("falls back to the popularity winner when the director cannot be resolved", async () => {
    mocks.searchFilms.mockResolvedValue({ results: draculaTie() });
    mocks.findDirectorId.mockResolvedValue(null);

    const match = await matchFilmToTMDB("Dracula", { year: 2025, director: "Unknown Person" });

    expect(match).not.toBeNull();
    expect(match!.tmdbId).toBe(100);
    expect(mocks.getPersonCredits).not.toHaveBeenCalled();
  });

  it("does not fetch director credits when there is no director hint, even on ties", async () => {
    mocks.searchFilms.mockResolvedValue({ results: draculaTie() });

    const match = await matchFilmToTMDB("Dracula", { year: 2025 });

    expect(match).not.toBeNull();
    expect(mocks.findDirectorId).not.toHaveBeenCalled();
  });

  it("survives a director-credit API failure and still returns a match", async () => {
    mocks.searchFilms.mockResolvedValue({ results: draculaTie() });
    mocks.findDirectorId.mockRejectedValue(new Error("TMDB API error: 500"));

    const match = await matchFilmToTMDB("Dracula", { year: 2025, director: "Radu Jude" });

    expect(match).not.toBeNull();
    expect(match!.tmdbId).toBe(100);
  });

  it("ignores a director hint that matches no close candidate (dirty hint / namesake)", async () => {
    mocks.searchFilms.mockResolvedValue({ results: draculaTie() });
    // findDirectorId resolved SOMEONE (e.g. a namesake), but they directed
    // neither close candidate — the adjustment must be a no-op, not a
    // blanket penalty that could reject a correct match or promote a weaker
    // never-examined candidate.
    mocks.findDirectorId.mockResolvedValue(99);
    mocks.getPersonCredits.mockResolvedValue({
      cast: [],
      crew: [{ id: 555, job: "Director", title: "An Unrelated Film" }],
    });

    const withDirtyHint = await matchFilmToTMDB("Dracula", {
      year: 2025,
      director: "Misspelled Namesake",
    });
    const control = await matchFilmToTMDB("Dracula", { year: 2025 });

    expect(withDirtyHint).not.toBeNull();
    expect(withDirtyHint!.tmdbId).toBe(control!.tmdbId);
    expect(withDirtyHint!.confidence).toBeCloseTo(control!.confidence, 5);
  });
});

describe("matchFilmToTMDB — venue language prior (step 5)", () => {
  /** Same-title same-year candidates: an English one (more popular) and a French one. */
  function languageTie() {
    return [
      makeResult({
        id: 100,
        title: "La Piscine",
        original_title: "The Swimming Pool",
        release_date: "2003-05-14",
        popularity: 400,
        original_language: "en",
      }),
      makeResult({
        id: 200,
        title: "La Piscine",
        original_title: "La Piscine",
        release_date: "2003-05-14",
        popularity: 8,
        original_language: "fr",
      }),
    ];
  }

  it("boosts the venue-language candidate past an otherwise-tied one", async () => {
    mocks.searchFilms.mockResolvedValue({ results: languageTie() });

    const match = await matchFilmToTMDB("La Piscine", {
      year: 2003,
      venueLanguages: ["fr"],
    });

    expect(match).not.toBeNull();
    expect(match!.tmdbId).toBe(200);
  });

  it("has no effect when no venue languages are provided", async () => {
    mocks.searchFilms.mockResolvedValue({ results: languageTie() });

    const match = await matchFilmToTMDB("La Piscine", { year: 2003 });

    expect(match).not.toBeNull();
    expect(match!.tmdbId).toBe(100);
  });

  it("has no effect when the venue languages do not include the candidate's language", async () => {
    mocks.searchFilms.mockResolvedValue({ results: languageTie() });

    const match = await matchFilmToTMDB("La Piscine", {
      year: 2003,
      venueLanguages: ["de"],
    });

    expect(match).not.toBeNull();
    expect(match!.tmdbId).toBe(100);
  });
});
