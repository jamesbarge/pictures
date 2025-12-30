/**
 * Film Status Store Tests
 * Tests for film status (watchlist, seen, not interested) management
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useFilmStatus, type FilmStatusEntry } from "./film-status";

describe("useFilmStatus store", () => {
  beforeEach(() => {
    // Reset store state before each test
    useFilmStatus.setState({ films: {} });
  });

  describe("setStatus", () => {
    it("should add film with want_to_see status", () => {
      useFilmStatus.getState().setStatus("film-1", "want_to_see");
      const entry = useFilmStatus.getState().films["film-1"];
      expect(entry).toBeDefined();
      expect(entry.status).toBe("want_to_see");
      expect(entry.addedAt).toBeDefined();
      expect(entry.updatedAt).toBeDefined();
    });

    it("should add film with seen status and set seenAt", () => {
      useFilmStatus.getState().setStatus("film-1", "seen");
      const entry = useFilmStatus.getState().films["film-1"];
      expect(entry.status).toBe("seen");
      expect(entry.seenAt).toBeDefined();
    });

    it("should add film with not_interested status", () => {
      useFilmStatus.getState().setStatus("film-1", "not_interested");
      const entry = useFilmStatus.getState().films["film-1"];
      expect(entry.status).toBe("not_interested");
    });

    it("should update status when changing from one to another", () => {
      useFilmStatus.getState().setStatus("film-1", "want_to_see");
      useFilmStatus.getState().setStatus("film-1", "seen");
      const entry = useFilmStatus.getState().films["film-1"];
      expect(entry.status).toBe("seen");
    });

    it("should preserve addedAt when updating status", () => {
      useFilmStatus.getState().setStatus("film-1", "want_to_see");
      const originalAddedAt = useFilmStatus.getState().films["film-1"].addedAt;

      // Simulate time passing
      useFilmStatus.getState().setStatus("film-1", "seen");

      const entry = useFilmStatus.getState().films["film-1"];
      expect(entry.addedAt).toBe(originalAddedAt);
    });

    it("should remove film when status is null", () => {
      useFilmStatus.getState().setStatus("film-1", "want_to_see");
      expect(useFilmStatus.getState().films["film-1"]).toBeDefined();

      useFilmStatus.getState().setStatus("film-1", null);
      expect(useFilmStatus.getState().films["film-1"]).toBeUndefined();
    });

    it("should store film metadata when provided", () => {
      useFilmStatus.getState().setStatus("film-1", "want_to_see", {
        title: "2001: A Space Odyssey",
        year: 1968,
        directors: ["Stanley Kubrick"],
        posterUrl: "https://example.com/poster.jpg",
      });

      const entry = useFilmStatus.getState().films["film-1"];
      expect(entry.filmTitle).toBe("2001: A Space Odyssey");
      expect(entry.filmYear).toBe(1968);
      expect(entry.filmDirectors).toEqual(["Stanley Kubrick"]);
      expect(entry.filmPosterUrl).toBe("https://example.com/poster.jpg");
    });
  });

  describe("setRating", () => {
    it("should set rating for existing film", () => {
      useFilmStatus.getState().setStatus("film-1", "seen");
      useFilmStatus.getState().setRating("film-1", 5);

      const entry = useFilmStatus.getState().films["film-1"];
      expect(entry.rating).toBe(5);
    });

    it("should not add rating for non-existent film", () => {
      useFilmStatus.getState().setRating("non-existent", 5);
      expect(useFilmStatus.getState().films["non-existent"]).toBeUndefined();
    });

    it("should update updatedAt when setting rating", () => {
      useFilmStatus.getState().setStatus("film-1", "seen");
      const before = useFilmStatus.getState().films["film-1"].updatedAt;

      useFilmStatus.getState().setRating("film-1", 4);
      const after = useFilmStatus.getState().films["film-1"].updatedAt;

      expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });
  });

  describe("setNotes", () => {
    it("should set notes for existing film", () => {
      useFilmStatus.getState().setStatus("film-1", "seen");
      useFilmStatus.getState().setNotes("film-1", "Great film!");

      const entry = useFilmStatus.getState().films["film-1"];
      expect(entry.notes).toBe("Great film!");
    });

    it("should not add notes for non-existent film", () => {
      useFilmStatus.getState().setNotes("non-existent", "Note");
      expect(useFilmStatus.getState().films["non-existent"]).toBeUndefined();
    });
  });

  describe("removeFilm", () => {
    it("should remove film from store", () => {
      useFilmStatus.getState().setStatus("film-1", "want_to_see");
      useFilmStatus.getState().setStatus("film-2", "seen");

      useFilmStatus.getState().removeFilm("film-1");

      expect(useFilmStatus.getState().films["film-1"]).toBeUndefined();
      expect(useFilmStatus.getState().films["film-2"]).toBeDefined();
    });

    it("should do nothing for non-existent film", () => {
      useFilmStatus.getState().setStatus("film-1", "want_to_see");
      const before = Object.keys(useFilmStatus.getState().films).length;

      useFilmStatus.getState().removeFilm("non-existent");

      expect(Object.keys(useFilmStatus.getState().films).length).toBe(before);
    });
  });

  describe("clearAll", () => {
    it("should remove all films", () => {
      useFilmStatus.getState().setStatus("film-1", "want_to_see");
      useFilmStatus.getState().setStatus("film-2", "seen");
      useFilmStatus.getState().setStatus("film-3", "not_interested");

      useFilmStatus.getState().clearAll();

      expect(useFilmStatus.getState().films).toEqual({});
    });
  });

  describe("getStatus", () => {
    it("should return status for existing film", () => {
      useFilmStatus.getState().setStatus("film-1", "want_to_see");
      expect(useFilmStatus.getState().getStatus("film-1")).toBe("want_to_see");
    });

    it("should return null for non-existent film", () => {
      expect(useFilmStatus.getState().getStatus("non-existent")).toBeNull();
    });
  });

  describe("getFilmsByStatus", () => {
    beforeEach(() => {
      useFilmStatus.getState().setStatus("film-1", "want_to_see");
      useFilmStatus.getState().setStatus("film-2", "want_to_see");
      useFilmStatus.getState().setStatus("film-3", "seen");
      useFilmStatus.getState().setStatus("film-4", "not_interested");
    });

    it("should return films with want_to_see status", () => {
      const films = useFilmStatus.getState().getFilmsByStatus("want_to_see");
      expect(films).toContain("film-1");
      expect(films).toContain("film-2");
      expect(films).toHaveLength(2);
    });

    it("should return films with seen status", () => {
      const films = useFilmStatus.getState().getFilmsByStatus("seen");
      expect(films).toContain("film-3");
      expect(films).toHaveLength(1);
    });

    it("should return films with not_interested status", () => {
      const films = useFilmStatus.getState().getFilmsByStatus("not_interested");
      expect(films).toContain("film-4");
      expect(films).toHaveLength(1);
    });
  });

  describe("getWatchlist", () => {
    it("should return only want_to_see films", () => {
      useFilmStatus.getState().setStatus("film-1", "want_to_see");
      useFilmStatus.getState().setStatus("film-2", "seen");
      useFilmStatus.getState().setStatus("film-3", "want_to_see");

      const watchlist = useFilmStatus.getState().getWatchlist();
      expect(watchlist).toContain("film-1");
      expect(watchlist).toContain("film-3");
      expect(watchlist).not.toContain("film-2");
      expect(watchlist).toHaveLength(2);
    });

    it("should return empty array when no watchlist films", () => {
      const watchlist = useFilmStatus.getState().getWatchlist();
      expect(watchlist).toEqual([]);
    });
  });

  describe("getSeenFilms", () => {
    it("should return only seen films", () => {
      useFilmStatus.getState().setStatus("film-1", "seen");
      useFilmStatus.getState().setStatus("film-2", "want_to_see");
      useFilmStatus.getState().setStatus("film-3", "seen");

      const seen = useFilmStatus.getState().getSeenFilms();
      expect(seen).toContain("film-1");
      expect(seen).toContain("film-3");
      expect(seen).not.toContain("film-2");
      expect(seen).toHaveLength(2);
    });
  });

  describe("getNotInterestedFilms", () => {
    it("should return not interested films with metadata", () => {
      useFilmStatus.getState().setStatus("film-1", "not_interested", {
        title: "Movie A",
        year: 2020,
        directors: ["Director A"],
      });
      useFilmStatus.getState().setStatus("film-2", "not_interested", {
        title: "Movie B",
        year: 2021,
      });
      useFilmStatus.getState().setStatus("film-3", "want_to_see");

      const notInterested = useFilmStatus.getState().getNotInterestedFilms();

      expect(notInterested).toHaveLength(2);

      // Should include metadata
      const movieA = notInterested.find((f) => f.filmId === "film-1");
      expect(movieA?.title).toBe("Movie A");
      expect(movieA?.year).toBe(2020);
      expect(movieA?.directors).toEqual(["Director A"]);
    });

    it("should sort by addedAt descending (most recent first)", () => {
      // Add films with different timestamps
      useFilmStatus.setState({
        films: {
          "film-1": {
            status: "not_interested",
            addedAt: "2025-01-01T10:00:00Z",
            updatedAt: "2025-01-01T10:00:00Z",
            filmTitle: "Older Film",
          },
          "film-2": {
            status: "not_interested",
            addedAt: "2025-01-03T10:00:00Z",
            updatedAt: "2025-01-03T10:00:00Z",
            filmTitle: "Newest Film",
          },
          "film-3": {
            status: "not_interested",
            addedAt: "2025-01-02T10:00:00Z",
            updatedAt: "2025-01-02T10:00:00Z",
            filmTitle: "Middle Film",
          },
        },
      });

      const notInterested = useFilmStatus.getState().getNotInterestedFilms();

      expect(notInterested[0].filmId).toBe("film-2"); // Newest
      expect(notInterested[1].filmId).toBe("film-3"); // Middle
      expect(notInterested[2].filmId).toBe("film-1"); // Oldest
    });

    it("should return 'Unknown Film' for films without title", () => {
      useFilmStatus.getState().setStatus("film-1", "not_interested");

      const notInterested = useFilmStatus.getState().getNotInterestedFilms();
      expect(notInterested[0].title).toBe("Unknown Film");
    });
  });

  describe("bulkSet", () => {
    it("should replace all films with provided data", () => {
      useFilmStatus.getState().setStatus("old-film", "seen");

      const newFilms: Record<string, FilmStatusEntry> = {
        "new-film-1": {
          status: "want_to_see",
          addedAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
        },
        "new-film-2": {
          status: "seen",
          addedAt: "2025-01-02T00:00:00Z",
          updatedAt: "2025-01-02T00:00:00Z",
          seenAt: "2025-01-02T00:00:00Z",
          rating: 4,
        },
      };

      useFilmStatus.getState().bulkSet(newFilms);

      expect(useFilmStatus.getState().films["old-film"]).toBeUndefined();
      expect(useFilmStatus.getState().films["new-film-1"]).toBeDefined();
      expect(useFilmStatus.getState().films["new-film-2"]).toBeDefined();
    });
  });

  describe("getAllFilms", () => {
    it("should return all films", () => {
      useFilmStatus.getState().setStatus("film-1", "want_to_see");
      useFilmStatus.getState().setStatus("film-2", "seen");

      const allFilms = useFilmStatus.getState().getAllFilms();

      expect(Object.keys(allFilms)).toHaveLength(2);
      expect(allFilms["film-1"]).toBeDefined();
      expect(allFilms["film-2"]).toBeDefined();
    });
  });
});
