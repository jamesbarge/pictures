/**
 * Tests for matchAndCreateFromTMDB in src/scrapers/utils/film-matching.ts.
 *
 * Mocks the DB, TMDB module, poster service, and similarity search so no
 * network or database access happens. Covers:
 *  - Step 1 (plan 005): the films INSERT carries the match audit trail
 *    (matchConfidence / matchStrategy / matchedAt / letterboxdUrl)
 *  - Step 2 (plan 005): screening-year contamination is stripped before
 *    the year hint reaches matchFilmToTMDB
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const selectLimit = vi.fn().mockResolvedValue([]);
  const matchFilmToTMDB = vi.fn();
  const getFullFilmData = vi.fn();
  const findPoster = vi.fn().mockResolvedValue({ source: "placeholder", url: null });
  return { insertValues, insert, selectLimit, matchFilmToTMDB, getFullFilmData, findPoster };
});

vi.mock("@/db", () => ({
  db: {
    insert: mocks.insert,
    select: () => ({
      from: () => ({
        where: () => ({ limit: mocks.selectLimit }),
      }),
    }),
  },
  withDbTimeout: <T>(promise: Promise<T>) => promise,
}));

vi.mock("@/lib/tmdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tmdb")>();
  return {
    ...actual,
    matchFilmToTMDB: mocks.matchFilmToTMDB,
    getTMDBClient: () => ({ getFullFilmData: mocks.getFullFilmData }),
  };
});

vi.mock("@/lib/posters", () => ({
  getPosterService: () => ({ findPoster: mocks.findPoster }),
}));

vi.mock("@/lib/film-similarity", () => ({
  isSimilarityConfigured: () => false,
  findMatchingFilm: vi.fn(),
}));

import { matchAndCreateFromTMDB, type FilmCache } from "./film-matching";

function makeCache(): FilmCache {
  return {
    byTitle: new Map(),
    byTmdbId: new Map(),
    stats: { hits: 0, misses: 0, dbQueries: 0 },
    normalizeTitle: (s: string) => s.toLowerCase().trim(),
  };
}

function makeFullFilmData(overrides: Record<string, unknown> = {}) {
  return {
    details: {
      imdb_id: "tt0000001",
      title: "Joyland",
      original_title: "Joyland",
      release_date: "2022-11-18",
      runtime: 126,
      genres: [{ id: 18, name: "Drama" }],
      production_countries: [{ iso_3166_1: "PK" }],
      spoken_languages: [{ iso_639_1: "ur" }],
      overview: "A synopsis.",
      tagline: "",
      poster_path: "/poster.jpg",
      backdrop_path: null,
      vote_average: 7.4,
      popularity: 12.3,
      ...overrides,
    },
    directors: ["Saim Sadiq"],
    cast: [],
    certification: "15",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectLimit.mockResolvedValue([]);
  mocks.insertValues.mockResolvedValue(undefined);
  mocks.findPoster.mockResolvedValue({ source: "placeholder", url: null });
});

describe("matchAndCreateFromTMDB — audit trail persistence (step 1)", () => {
  it("persists matchConfidence/matchStrategy/matchedAt/letterboxdUrl on the films insert", async () => {
    mocks.matchFilmToTMDB.mockResolvedValue({
      tmdbId: 555,
      confidence: 0.87,
      title: "Joyland",
      year: 2022,
      posterPath: "/poster.jpg",
    });
    mocks.getFullFilmData.mockResolvedValue(makeFullFilmData());

    const filmId = await matchAndCreateFromTMDB(makeCache(), "Joyland", 2022);

    expect(filmId).not.toBeNull();
    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
    const payload = mocks.insertValues.mock.calls[0][0];
    expect(payload.matchConfidence).toBe(0.87);
    expect(payload.matchStrategy).toBe("auto-with-year");
    expect(payload.matchedAt).toBeInstanceOf(Date);
    expect(payload.letterboxdUrl).toBe("https://letterboxd.com/tmdb/555");
  });

  it("returns existing film id without inserting when TMDB id already exists in DB", async () => {
    mocks.matchFilmToTMDB.mockResolvedValue({
      tmdbId: 555,
      confidence: 0.9,
      title: "Joyland",
      year: 2022,
      posterPath: null,
    });
    mocks.selectLimit.mockResolvedValue([{ id: "existing-film-id" }]);

    const filmId = await matchAndCreateFromTMDB(makeCache(), "Joyland", 2022);

    expect(filmId).toBe("existing-film-id");
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });
});
