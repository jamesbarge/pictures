/**
 * Tests for the current-release rule in matchFilmToTMDB.
 *
 * A single-word title needs a year to pass the ambiguity gate, and year
 * discipline drops any current-year hint, so a new release like "Digger"
 * could never match. When the gate would skip, exactly one GB current
 * release with that exact title is accepted instead.
 *
 * The TMDB client and blocklist are mocked; no live API calls.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TMDBSearchResult } from "./types";
import { loadThresholds } from "@/lib/data-quality/load-thresholds";

const mocks = vi.hoisted(() => ({
  searchFilms: vi.fn(),
  getFilmDetails: vi.fn(),
  getCurrentReleases: vi.fn(),
  blocked: new Set<number>(),
}));

vi.mock("./client", () => ({
  getTMDBClient: () => ({
    searchFilms: mocks.searchFilms,
    getFilmDetails: mocks.getFilmDetails,
    getCurrentReleases: mocks.getCurrentReleases,
  }),
}));

vi.mock("./blocklist", () => ({
  getBlockedTmdbIds: () => mocks.blocked,
  checkTitleBlocklist: () => null,
  incrementBlocklistUsage: vi.fn(),
}));

import { matchFilmToTMDB } from "./match";

function film(id: number, title: string, releaseDate: string, overrides: Partial<TMDBSearchResult> = {}): TMDBSearchResult {
  return {
    id,
    title,
    original_title: title,
    release_date: releaseDate,
    poster_path: `/${id}.jpg`,
    backdrop_path: null,
    overview: "",
    popularity: 10,
    vote_average: 7,
    genre_ids: [],
    original_language: "en",
    adult: false,
    ...overrides,
  };
}

const DIGGER_2026 = film(2026, "Digger", "2026-10-02");
const DIGGER_2021 = film(2021, "Digger", "2021-03-12");
const DIGGER_1993 = film(1993, "Digger", "1993-08-20");

/** A first-run venue such as a Picturehouse; the pipeline sets this per venue. */
const FIRST_RUN = { allowCurrentRelease: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.blocked.clear();
  mocks.searchFilms.mockResolvedValue({ results: [DIGGER_2026, DIGGER_2021, DIGGER_1993] });
  mocks.getCurrentReleases.mockResolvedValue([DIGGER_2026, film(500, "Verity", "2026-10-02")]);
});

describe("matchFilmToTMDB: current GB release rule", () => {
  it("accepts the one current release with the exact title over older namesakes", async () => {
    const match = await matchFilmToTMDB("Digger", FIRST_RUN);

    expect(match).not.toBeNull();
    expect(match!.tmdbId).toBe(2026);
    expect(match!.year).toBe(2026);
    expect(match!.strategy).toBe("current-release");
    expect(match!.confidence).toBeGreaterThanOrEqual(loadThresholds().tmdb.minMatchConfidence);
  });

  it("folds case and accents when comparing titles", async () => {
    mocks.getCurrentReleases.mockResolvedValue([film(77, "Amélie", "2026-09-30")]);

    const match = await matchFilmToTMDB("AMELIE", FIRST_RUN);

    expect(match?.tmdbId).toBe(77);
  });

  it("matches a current release on its original title", async () => {
    mocks.getCurrentReleases.mockResolvedValue([
      film(88, "The Ugly Stepsister", "2026-09-26", { original_title: "Stesøsteren" }),
    ]);

    const match = await matchFilmToTMDB("Stesøsteren", FIRST_RUN);

    expect(match?.tmdbId).toBe(88);
  });

  it("keeps the skip when two current releases share the title", async () => {
    mocks.getCurrentReleases.mockResolvedValue([DIGGER_2026, film(3030, "Digger", "2026-10-09")]);

    expect(await matchFilmToTMDB("Digger", FIRST_RUN)).toBeNull();
  });

  it("keeps the skip when only non-current films carry the title", async () => {
    mocks.getCurrentReleases.mockResolvedValue([film(500, "Verity", "2026-10-02")]);

    expect(await matchFilmToTMDB("Digger", FIRST_RUN)).toBeNull();
    expect(mocks.searchFilms).not.toHaveBeenCalled();
  });

  it("does not treat a current release with a subtitle as the same title", async () => {
    mocks.getCurrentReleases.mockResolvedValue([film(600, "Alien: Earth", "2026-10-01")]);

    expect(await matchFilmToTMDB("Alien", FIRST_RUN)).toBeNull();
  });

  it("ignores a blocklisted current release", async () => {
    mocks.blocked.add(2026);

    expect(await matchFilmToTMDB("Digger", FIRST_RUN)).toBeNull();
  });

  it("rejects a current release whose year disagrees with the year hint", async () => {
    // "Heat" is highly ambiguous, so a year alone does not pass the gate. A
    // 1995 hint must not be answered with a new film that shares the name.
    mocks.getCurrentReleases.mockResolvedValue([film(700, "Heat", "2026-10-01")]);

    expect(await matchFilmToTMDB("Heat", { ...FIRST_RUN, year: 1995 })).toBeNull();
  });

  it("accepts a current release within a year of the hint", async () => {
    mocks.getCurrentReleases.mockResolvedValue([film(701, "Heat", "2025-12-26")]);

    expect((await matchFilmToTMDB("Heat", { ...FIRST_RUN, year: 2026 }))?.tmdbId).toBe(701);
  });

  it("keeps the skip when the current-release lookup fails", async () => {
    mocks.getCurrentReleases.mockRejectedValue(new Error("TMDB API error: 503"));

    expect(await matchFilmToTMDB("Digger", FIRST_RUN)).toBeNull();
  });

  it("still applies the runtime cross-check to a current-release match", async () => {
    mocks.getFilmDetails.mockResolvedValue({ runtime: 0 });

    expect(await matchFilmToTMDB("Digger", { ...FIRST_RUN, runtime: 100 })).toBeNull();
    expect(mocks.getFilmDetails).toHaveBeenCalledWith(2026);
  });

  it("makes no current-release call for a title the gate lets through", async () => {
    mocks.searchFilms.mockResolvedValue({ results: [film(42, "The Night is Fading Away", "2025-02-01")] });

    const match = await matchFilmToTMDB("The Night is Fading Away", FIRST_RUN);

    expect(match?.tmdbId).toBe(42);
    expect(match?.strategy).toBeUndefined();
    expect(mocks.getCurrentReleases).not.toHaveBeenCalled();
  });

  it("makes no current-release call when the ambiguity check is skipped", async () => {
    await matchFilmToTMDB("Digger", { ...FIRST_RUN, skipAmbiguityCheck: true });

    expect(mocks.getCurrentReleases).not.toHaveBeenCalled();
  });
});

describe("matchFilmToTMDB: current-release rule is for first-run venues only", () => {
  it("keeps the skip for Digger at a repertory venue", async () => {
    expect(await matchFilmToTMDB("Digger", { allowCurrentRelease: false })).toBeNull();
    expect(mocks.getCurrentReleases).not.toHaveBeenCalled();
  });

  it("keeps the skip when the venue is unknown", async () => {
    expect(await matchFilmToTMDB("Digger")).toBeNull();
    expect(mocks.getCurrentReleases).not.toHaveBeenCalled();
  });

  it("matches Frankenstein at a repertory venue with a 1931 hint to the 1931 film", async () => {
    const frankenstein1931 = film(3035, "Frankenstein", "1931-11-21");
    const frankenstein2025 = film(1062722, "Frankenstein", "2025-10-17");
    mocks.searchFilms.mockResolvedValue({ results: [frankenstein1931, frankenstein2025] });
    mocks.getCurrentReleases.mockResolvedValue([frankenstein2025]);

    const match = await matchFilmToTMDB("Frankenstein", { year: 1931, allowCurrentRelease: false });

    expect(match?.tmdbId).toBe(3035);
    expect(match?.strategy).toBeUndefined();
    expect(mocks.getCurrentReleases).not.toHaveBeenCalled();
  });

  it("never answers a 1931 hint with the current Frankenstein, even at a first-run venue", async () => {
    // "Frankenstein" passes the gate with a year, so the rule never runs; the
    // scorer weighs the 1931 hint.
    const frankenstein1931 = film(3035, "Frankenstein", "1931-11-21");
    const frankenstein2025 = film(1062722, "Frankenstein", "2025-10-17");
    mocks.searchFilms.mockResolvedValue({ results: [frankenstein2025, frankenstein1931] });
    mocks.getCurrentReleases.mockResolvedValue([frankenstein2025]);

    const match = await matchFilmToTMDB("Frankenstein", { ...FIRST_RUN, year: 1931 });

    expect(match?.tmdbId).toBe(3035);
  });
});
