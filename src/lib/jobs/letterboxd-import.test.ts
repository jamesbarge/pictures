import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const films = {
    id: "films.id",
    tmdbId: "films.tmdbId",
    title: "films.title",
    year: "films.year",
    directors: "films.directors",
    posterUrl: "films.posterUrl",
  };
  const userFilmStatuses = {
    userId: "userFilmStatuses.userId",
    filmId: "userFilmStatuses.filmId",
  };
  const selectResults: unknown[][] = [];
  const filmValues = vi.fn();
  const statusValues = vi.fn();
  const filmConflict = vi.fn();
  const statusConflict = vi.fn();
  const filmReturning = vi.fn();
  const select = vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: async () => selectResults.shift() ?? [],
      }),
    }),
  }));
  const insert = vi.fn((table: unknown) => ({
    values: (values: unknown) => {
      if (table === films) {
        filmValues(values);
        return {
          onConflictDoNothing: (config: unknown) => {
            filmConflict(config);
            return { returning: filmReturning };
          },
        };
      }

      statusValues(values);
      return {
        onConflictDoNothing: async (config: unknown) => {
          statusConflict(config);
        },
      };
    },
  }));
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({ select, insert }),
  );

  return {
    films,
    userFilmStatuses,
    selectResults,
    filmValues,
    statusValues,
    filmConflict,
    statusConflict,
    filmReturning,
    select,
    insert,
    transaction,
    matchFilmToTMDB: vi.fn(),
    getFullFilmData: vi.fn(),
  };
});

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}));

vi.mock("@/db/schema", () => ({
  films: mocks.films,
  userFilmStatuses: mocks.userFilmStatuses,
}));

vi.mock("@/lib/tmdb", () => ({
  matchFilmToTMDB: mocks.matchFilmToTMDB,
  getTMDBClient: () => ({ getFullFilmData: mocks.getFullFilmData }),
  isRepertoryFilm: vi.fn(() => false),
  getDecade: vi.fn(() => "2020s"),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "candidate-film-id"),
}));

import { runLetterboxdImport } from "./letterboxd-import";

const payload = {
  userId: "user-1",
  username: "viewer",
  entries: [{ title: "Existing Film", year: 2024, slug: "existing-film" }],
};

const match = {
  tmdbId: 123,
  title: "Existing Film",
  year: 2024,
  posterPath: "/poster.jpg",
  confidence: 0.99,
};

const canonicalFilm = {
  id: "canonical-film-id",
  title: "Existing Film",
  year: 2024,
  directors: ["Director"],
  posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
};

describe("runLetterboxdImport integrity", () => {
  beforeEach(() => {
    mocks.selectResults.length = 0;
    mocks.matchFilmToTMDB.mockResolvedValue(match);
    mocks.filmReturning.mockResolvedValue([{ id: "candidate-film-id" }]);
  });

  it("preserves an existing user status by doing nothing on conflict", async () => {
    mocks.selectResults.push([{ id: canonicalFilm.id }], [canonicalFilm]);

    const output = await runLetterboxdImport(payload);

    expect(output.details[0].filmId).toBe(canonicalFilm.id);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.filmValues).not.toHaveBeenCalled();
    expect(mocks.statusConflict).toHaveBeenCalledWith({
      target: [mocks.userFilmStatuses.userId, mocks.userFilmStatuses.filmId],
    });
  });

  it("persists the canonical Letterboxd slug + URL when creating a new film", async () => {
    mocks.selectResults.push([], [canonicalFilm]);
    mocks.filmReturning.mockResolvedValue([{ id: "candidate-film-id" }]);
    mocks.getFullFilmData.mockResolvedValue({
      details: {
        title: "Existing Film",
        original_title: "Existing Film",
        imdb_id: "tt123",
        runtime: 100,
        genres: [{ name: "Drama" }],
        production_countries: [{ iso_3166_1: "GB" }],
        spoken_languages: [{ iso_639_1: "en" }],
        overview: "Synopsis",
        tagline: "Tagline",
        poster_path: "/poster.jpg",
        backdrop_path: "/backdrop.jpg",
        release_date: "2024-01-01",
        vote_average: 7,
        popularity: 10,
      },
      directors: ["Director"],
      cast: [],
      certification: "12",
    });

    await runLetterboxdImport(payload);

    // Letterboxd's own data-film-slug is the highest-trust identity source
    expect(mocks.filmValues).toHaveBeenCalledWith(
      expect.objectContaining({
        letterboxdSlug: "existing-film",
        letterboxdUrl: "https://letterboxd.com/film/existing-film/",
      }),
    );
  });

  it("leaves Letterboxd identity null when the entry has no slug", async () => {
    mocks.selectResults.push([], [canonicalFilm]);
    mocks.filmReturning.mockResolvedValue([{ id: "candidate-film-id" }]);
    mocks.getFullFilmData.mockResolvedValue({
      details: {
        title: "Existing Film",
        original_title: "Existing Film",
        imdb_id: "tt123",
        runtime: 100,
        genres: [],
        production_countries: [],
        spoken_languages: [],
        overview: "Synopsis",
        tagline: "Tagline",
        poster_path: null,
        backdrop_path: null,
        release_date: "2024-01-01",
        vote_average: 7,
        popularity: 10,
      },
      directors: [],
      cast: [],
      certification: null,
    });

    await runLetterboxdImport({
      ...payload,
      entries: [{ title: "Existing Film", year: 2024, slug: "" }],
    });

    expect(mocks.filmValues).toHaveBeenCalledWith(
      expect.objectContaining({
        letterboxdSlug: null,
        letterboxdUrl: null,
      }),
    );
  });

  it("selects the concurrent winner after a conflict-safe film insert", async () => {
    mocks.selectResults.push([], [canonicalFilm]);
    mocks.filmReturning.mockResolvedValue([]);
    mocks.getFullFilmData.mockResolvedValue({
      details: {
        title: "Existing Film",
        original_title: "Existing Film",
        imdb_id: "tt123",
        runtime: 100,
        genres: [{ name: "Drama" }],
        production_countries: [{ iso_3166_1: "GB" }],
        spoken_languages: [{ iso_639_1: "en" }],
        overview: "Synopsis",
        tagline: "Tagline",
        poster_path: "/poster.jpg",
        backdrop_path: "/backdrop.jpg",
        release_date: "2024-01-01",
        vote_average: 7,
        popularity: 10,
      },
      directors: ["Director"],
      cast: [],
      certification: "12",
    });

    const output = await runLetterboxdImport(payload);

    expect(output.details[0].filmId).toBe(canonicalFilm.id);
    expect(mocks.filmConflict).toHaveBeenCalledWith({
      target: mocks.films.tmdbId,
    });
    expect(mocks.statusValues).toHaveBeenCalledWith(
      expect.objectContaining({ filmId: canonicalFilm.id }),
    );
  });
});
