/**
 * Screening Repository Tests
 *
 * Unit tests for the screening repository functions.
 * These tests mock the database layer to test query building logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScreeningFilters } from "./screening";

// Create a chainable mock that handles all query patterns
const createQueryChain = () => {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "innerJoin", "where", "orderBy", "limit", "select"];

  methods.forEach((method) => {
    chain[method] = vi.fn(() => {
      if (method === "limit") {
        return Promise.resolve([]);
      }
      return chain;
    });
  });

  return chain;
};

// Mock the db module
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => createQueryChain()),
  },
}));

describe("ScreeningFilters", () => {
  describe("type validation", () => {
    it("should accept valid filter object", () => {
      const filters: ScreeningFilters = {
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-31"),
        cinemaIds: ["cinema-1", "cinema-2"],
        formats: ["35mm", "dcp"],
        isRepertory: true,
        festivalOnly: false,
      };

      expect(filters.startDate).toBeInstanceOf(Date);
      expect(filters.endDate).toBeInstanceOf(Date);
      expect(filters.cinemaIds).toHaveLength(2);
      expect(filters.formats).toHaveLength(2);
      expect(filters.isRepertory).toBe(true);
      expect(filters.festivalOnly).toBe(false);
    });

    it("should allow optional filters", () => {
      const filters: ScreeningFilters = {
        startDate: new Date(),
        endDate: new Date(),
      };

      expect(filters.cinemaIds).toBeUndefined();
      expect(filters.formats).toBeUndefined();
      expect(filters.isRepertory).toBeUndefined();
      expect(filters.festivalOnly).toBeUndefined();
    });
  });
});

describe("screeningWithDetailsSelect", () => {
  it("should export the select object", async () => {
    const { screeningWithDetailsSelect } = await import("./screening");

    expect(screeningWithDetailsSelect).toBeDefined();
    expect(screeningWithDetailsSelect.id).toBeDefined();
    expect(screeningWithDetailsSelect.datetime).toBeDefined();
    expect(screeningWithDetailsSelect.film).toBeDefined();
    expect(screeningWithDetailsSelect.cinema).toBeDefined();
  });

  it("should include film nested fields", async () => {
    const { screeningWithDetailsSelect } = await import("./screening");

    expect(screeningWithDetailsSelect.film.id).toBeDefined();
    expect(screeningWithDetailsSelect.film.title).toBeDefined();
    expect(screeningWithDetailsSelect.film.year).toBeDefined();
    expect(screeningWithDetailsSelect.film.directors).toBeDefined();
    expect(screeningWithDetailsSelect.film.posterUrl).toBeDefined();
    expect(screeningWithDetailsSelect.film.isRepertory).toBeDefined();
  });

  it("should include cinema nested fields", async () => {
    const { screeningWithDetailsSelect } = await import("./screening");

    expect(screeningWithDetailsSelect.cinema.id).toBeDefined();
    expect(screeningWithDetailsSelect.cinema.name).toBeDefined();
    expect(screeningWithDetailsSelect.cinema.shortName).toBeDefined();
  });
});

describe("festivalScreeningSelect", () => {
  it("should extend screeningWithDetailsSelect", async () => {
    const { festivalScreeningSelect, screeningWithDetailsSelect } = await import("./screening");

    // Should have all base fields
    expect(festivalScreeningSelect.id).toBe(screeningWithDetailsSelect.id);
    expect(festivalScreeningSelect.film).toBe(screeningWithDetailsSelect.film);
    expect(festivalScreeningSelect.cinema).toBe(screeningWithDetailsSelect.cinema);

    // Should have additional festival fields
    expect(festivalScreeningSelect.festivalSection).toBeDefined();
    expect(festivalScreeningSelect.isPremiere).toBeDefined();
    expect(festivalScreeningSelect.premiereType).toBeDefined();
  });
});

describe("getScreenings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should be an async function", async () => {
    const { getScreenings } = await import("./screening");

    expect(typeof getScreenings).toBe("function");
  });

  it("should return an array", async () => {
    const { getScreenings } = await import("./screening");

    const result = await getScreenings({
      startDate: new Date(),
      endDate: new Date(),
    });

    expect(Array.isArray(result)).toBe(true);
  });
});

describe("getScreeningsByFestival", () => {
  it("should return festival and screenings", async () => {
    const { getScreeningsByFestival } = await import("./screening");

    const result = await getScreeningsByFestival("test-festival", {
      startDate: new Date(),
      endDate: new Date(),
    });

    expect(result).toHaveProperty("festival");
    expect(result).toHaveProperty("screenings");
    expect(Array.isArray(result.screenings)).toBe(true);
  });
});

describe("getScreeningsBySeason", () => {
  it("should return season and screenings", async () => {
    const { getScreeningsBySeason } = await import("./screening");

    const result = await getScreeningsBySeason("test-season", {
      startDate: new Date(),
      endDate: new Date(),
    });

    expect(result).toHaveProperty("season");
    expect(result).toHaveProperty("screenings");
    expect(Array.isArray(result.screenings)).toBe(true);
  });
});

describe("getRecentScreeningsForCinema", () => {
  it("should be an async function", async () => {
    const { getRecentScreeningsForCinema } = await import("./screening");

    expect(typeof getRecentScreeningsForCinema).toBe("function");
  });

  it("should return an array", async () => {
    const { getRecentScreeningsForCinema } = await import("./screening");

    const result = await getRecentScreeningsForCinema("test-cinema-id");

    expect(Array.isArray(result)).toBe(true);
  });
});
