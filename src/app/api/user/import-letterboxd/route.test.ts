import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const films = {
    id: "films.id",
    title: "films.title",
    year: "films.year",
    directors: "films.directors",
    posterUrl: "films.posterUrl",
  };
  const userFilmStatuses = {
    userId: "userFilmStatuses.userId",
    filmId: "userFilmStatuses.filmId",
  };
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onConflictDoNothing }));
  return {
    films,
    userFilmStatuses,
    onConflictDoNothing,
    values,
    requireAuth: vi.fn(),
    runLetterboxdImport: vi.fn(),
  };
});

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => [{
          id: "film-1",
          title: "Film",
          year: 2024,
          directors: ["Director"],
          posterUrl: "/poster.jpg",
        }],
      }),
    }),
    insert: () => ({ values: mocks.values }),
  },
}));

vi.mock("@/db/schema", () => ({
  films: mocks.films,
  userFilmStatuses: mocks.userFilmStatuses,
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
  unauthorizedResponse: vi.fn(),
}));

vi.mock("@/lib/jobs/letterboxd-import", () => ({
  runLetterboxdImport: mocks.runLetterboxdImport,
}));

vi.mock("drizzle-orm", () => ({
  inArray: vi.fn(),
}));

import { POST } from "./route";

describe("POST /api/user/import-letterboxd", () => {
  beforeEach(() => {
    mocks.requireAuth.mockResolvedValue("user-1");
  });

  it("adds new watchlist rows without overwriting existing statuses", async () => {
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ filmIds: ["film-1"] }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.onConflictDoNothing).toHaveBeenCalledWith({
      target: [mocks.userFilmStatuses.userId, mocks.userFilmStatuses.filmId],
    });
    expect(await response.json()).toEqual({
      saved: 1,
      pendingLookup: 0,
      backgroundTaskTriggered: false,
    });
  });
});
