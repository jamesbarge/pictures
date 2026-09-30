/**
 * Sequel safety in the TMDB fallback.
 *
 * Fixing the trigram matcher alone is not an end-to-end fix: once the DB guard
 * refuses a candidate, `getOrCreateFilm` hands the very same title to
 * `matchFilmToTMDB`, and this module has its own way of scoring a base title
 * highly against its sequel. `calculateSimilarity` awards a containment bonus
 * (`0.8 + shorter/longer * 0.2`), so "practical magic 2" against "practical
 * magic" scores about 0.976 before any year or popularity signal.
 *
 * These drive the REAL `matchFilmToTMDB` with the transport mocked — no network
 * — so the candidate loop, the scoring, the competitor penalty and the new
 * identity guard are all production code.
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
    title: "Practical Magic",
    original_title: "Practical Magic",
    release_date: "1998-10-16",
    poster_path: "/p.jpg",
    backdrop_path: null,
    overview: "",
    popularity: 10,
    vote_average: 7,
    vote_count: 100,
    genre_ids: [],
    original_language: "en",
    adult: false,
    video: false,
    ...overrides,
  } as TMDBSearchResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchFilms.mockResolvedValue({ results: [] });
});

describe("the fallback must not adopt a base title for a sequel", () => {
  it("refuses the 1998 original when the search title is the 2026 sequel", async () => {
    // The exact hand-off: the DB guard has just refused this title, and TMDB
    // search returns only the original because the sequel is not indexed yet.
    mocks.searchFilms.mockResolvedValue({ results: [makeResult({ id: 6435 })] });

    await expect(matchFilmToTMDB("Practical Magic 2")).resolves.toBeNull();
  });

  it("refuses it even with a year hint that cannot discriminate", async () => {
    mocks.searchFilms.mockResolvedValue({ results: [makeResult({ id: 6435 })] });

    await expect(matchFilmToTMDB("Practical Magic 2", { year: 1998 })).resolves.toBeNull();
  });

  it('refuses "Rob Zombie\'s Halloween II" adopting "Rob Zombie\'s Halloween"', async () => {
    mocks.searchFilms.mockResolvedValue({
      results: [
        makeResult({
          id: 2082,
          title: "Rob Zombie's Halloween",
          original_title: "Halloween",
          release_date: "2007-08-31",
        }),
      ],
    });

    await expect(matchFilmToTMDB("Rob Zombie's Halloween II")).resolves.toBeNull();
  });

  it('refuses "Mockingjay - Part 2" adopting "Part 1"', async () => {
    mocks.searchFilms.mockResolvedValue({
      results: [
        makeResult({
          id: 131631,
          title: "The Hunger Games: Mockingjay - Part 1",
          original_title: "The Hunger Games: Mockingjay - Part 1",
          release_date: "2014-11-18",
        }),
      ],
    });

    await expect(matchFilmToTMDB("Mockingjay - Part 2")).resolves.toBeNull();
  });

  it("refuses a base search title adopting a numbered candidate", async () => {
    // Direction matters too: searching the base must not adopt the sequel.
    mocks.searchFilms.mockResolvedValue({
      results: [makeResult({ id: 999, title: "Practical Magic 2", original_title: "Practical Magic 2", release_date: "2026-09-18" })],
    });

    await expect(matchFilmToTMDB("Practical Magic")).resolves.toBeNull();
  });
});

describe("the guard leaves correct matching intact", () => {
  it("still matches an exact title", async () => {
    mocks.searchFilms.mockResolvedValue({ results: [makeResult({ id: 6435 })] });

    const match = await matchFilmToTMDB("Practical Magic", { year: 1998 });
    expect(match?.tmdbId).toBe(6435);
  });

  it("still matches a numbered title against the same number", async () => {
    mocks.searchFilms.mockResolvedValue({
      results: [
        makeResult({
          id: 24150,
          title: "Halloween II",
          original_title: "Halloween II",
          release_date: "2009-08-28",
        }),
      ],
    });

    const match = await matchFilmToTMDB("Rob Zombie's Halloween II", { year: 2009 });
    expect(match?.tmdbId).toBe(24150);
  });

  it("still matches across Roman and Arabic renderings of one instalment", async () => {
    mocks.searchFilms.mockResolvedValue({
      results: [
        makeResult({
          id: 11281,
          title: "Halloween II",
          original_title: "Halloween II",
          release_date: "1981-10-30",
        }),
      ],
    });

    const match = await matchFilmToTMDB("Halloween 2", { year: 1981 });
    expect(match?.tmdbId).toBe(11281);
  });

  it("still matches through a decoration suffix", async () => {
    mocks.searchFilms.mockResolvedValue({
      results: [
        makeResult({
          id: 335984,
          title: "Blade Runner 2049",
          original_title: "Blade Runner 2049",
          release_date: "2017-10-04",
        }),
      ],
    });

    const match = await matchFilmToTMDB("BLADE RUNNER 2049 (4K Restoration)", { year: 2017 });
    expect(match?.tmdbId).toBe(335984);
  });

  it("accepts the original_title's numbering when the localised title lacks it", async () => {
    // Rejection needs BOTH titles to disagree, mirroring the Math.max the
    // similarity scoring already applies across the two fields.
    mocks.searchFilms.mockResolvedValue({
      results: [
        makeResult({
          id: 4567,
          title: "Nymphomaniac",
          original_title: "Nymphomaniac Vol. 2",
          release_date: "2013-12-25",
        }),
      ],
    });

    const match = await matchFilmToTMDB("Nymphomaniac Vol. 2", { year: 2013 });
    expect(match?.tmdbId).toBe(4567);
  });
});

describe("original_title only counts when it is real evidence", () => {
  it("rejects a numbered candidate when original_title is absent", async () => {
    // The hole an `?? ""` fallback opens: an empty alternate title carries no
    // number, which trivially "agrees" with a base-title search and would wave
    // the numbered candidate straight through.
    mocks.searchFilms.mockResolvedValue({
      results: [
        makeResult({
          id: 999,
          title: "Practical Magic 2",
          original_title: undefined as unknown as string,
          release_date: "2026-09-18",
        }),
      ],
    });

    await expect(matchFilmToTMDB("Practical Magic")).resolves.toBeNull();
  });

  it("rejects a numbered candidate when original_title is empty or blank", async () => {
    for (const blank of ["", "   "]) {
      mocks.searchFilms.mockResolvedValue({
        results: [
          makeResult({
            id: 999,
            title: "Practical Magic 2",
            original_title: blank,
            release_date: "2026-09-18",
          }),
        ],
      });

      await expect(matchFilmToTMDB("Practical Magic")).resolves.toBeNull();
    }
  });

  it("rejects when an unrelated original_title would otherwise excuse the mismatch", async () => {
    // "Completely Unrelated Feature" carries no number, so a bare value
    // comparison would call it agreement with a numberless search title and
    // override the conflicting, highly similar "Practical Magic 2".
    mocks.searchFilms.mockResolvedValue({
      results: [
        makeResult({
          id: 999,
          title: "Practical Magic 2",
          original_title: "Completely Unrelated Feature",
          release_date: "2026-09-18",
        }),
      ],
    });

    await expect(matchFilmToTMDB("Practical Magic")).resolves.toBeNull();
  });
});

describe("a field may only lend evidence it actually has", () => {
  // Both reproduced from the reviewer's offline run of the production matcher:
  // each was accepted with confidence 0.8935294117647059 on search title
  // "Practical Magic" with year hint 2026.

  it("refuses when an unrelated main title lends the absent-number agreement", async () => {
    // Blocker 1. `title` carries no number, so it agrees with the numberless
    // search title; `original_title` carries the conflicting 2 but supplies all
    // the similarity. Taken field-by-field the candidate looks fine from one
    // side and matches from the other, so eligibility and scoring must be
    // decided on the SAME field.
    mocks.searchFilms.mockResolvedValue({
      results: [
        makeResult({
          id: 999,
          title: "Completely Unrelated Feature",
          original_title: "Practical Magic 2",
          release_date: "2026-09-18",
          popularity: 10,
        }),
      ],
    });

    await expect(matchFilmToTMDB("Practical Magic", { year: 2026 })).resolves.toBeNull();
  });

  it("refuses when the original title normalizes away to nothing", async () => {
    // Blocker 2. "魔法" is non-empty raw but the Latin-only normalizer reduces
    // it to "", and calculateSimilarity treats "" as contained in everything,
    // handing back its 0.8 containment floor. That cleared minTitleSimilarity
    // 0.6 and supplied a spurious absent-number agreement.
    mocks.searchFilms.mockResolvedValue({
      results: [
        makeResult({
          id: 999,
          title: "Practical Magic 2",
          original_title: "魔法",
          release_date: "2026-09-18",
          popularity: 10,
        }),
      ],
    });

    await expect(matchFilmToTMDB("Practical Magic", { year: 2026 })).resolves.toBeNull();
  });
});

describe("a year in the name identifies the film here too", () => {
  it('refuses "Blade Runner 2049" adopting "Blade Runner"', async () => {
    mocks.searchFilms.mockResolvedValue({
      results: [
        makeResult({
          id: 78,
          title: "Blade Runner",
          original_title: "Blade Runner",
          release_date: "1982-06-25",
          popularity: 500,
        }),
      ],
    });

    await expect(matchFilmToTMDB("Blade Runner 2049")).resolves.toBeNull();
  });

  it('refuses "Blade Runner" adopting "Blade Runner 2049"', async () => {
    mocks.searchFilms.mockResolvedValue({
      results: [
        makeResult({
          id: 335984,
          title: "Blade Runner 2049",
          original_title: "Blade Runner 2049",
          release_date: "2017-10-04",
        }),
      ],
    });

    await expect(matchFilmToTMDB("Blade Runner")).resolves.toBeNull();
  });
});

describe("rejecting one candidate still permits a correct one", () => {
  it("skips the base title and takes the correctly numbered candidate behind it", async () => {
    // The wrong candidate is both first and more popular, so only the identity
    // guard can move the decision to the right one.
    mocks.searchFilms.mockResolvedValue({
      results: [
        makeResult({
          id: 2082,
          title: "Rob Zombie's Halloween",
          original_title: "Halloween",
          release_date: "2007-08-31",
          popularity: 900,
        }),
        makeResult({
          id: 24150,
          title: "Halloween II",
          original_title: "Halloween II",
          release_date: "2009-08-28",
          popularity: 5,
        }),
      ],
    });

    const match = await matchFilmToTMDB("Rob Zombie's Halloween II", { year: 2009 });
    expect(match?.tmdbId).toBe(24150);
  });
});
