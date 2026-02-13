import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FestivalDetector } from "./festival-detector";
import { FESTIVAL_CONFIGS } from "./festival-config";

// Mock the database module
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  festivals: {
    id: "id",
    slug: "slug",
    name: "name",
    shortName: "short_name",
    startDate: "start_date",
    endDate: "end_date",
    venues: "venues",
    isActive: "is_active",
  },
}));

describe("FestivalDetector", () => {
  // Pre-populate the cache with mock festival data
  // We'll bypass the DB by directly setting the cache via detect()
  // Since detect() is sync and requires preload(), we test the matching logic directly

  describe("detect() with loaded cache", () => {
    beforeEach(async () => {
      // Mock the DB query to return our test festivals
      const { db } = await import("@/db");
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "ff-1",
              slug: "frightfest-2026",
              name: "FrightFest 2026",
              shortName: "FrightFest",
              startDate: "2026-08-27",
              endDate: "2026-08-31",
              venues: ["prince-charles"],
            },
            {
              id: "liff-1",
              slug: "liff-2026",
              name: "London Independent Film Festival 2026",
              shortName: "LIFF",
              startDate: "2026-04-09",
              endDate: "2026-04-19",
              venues: ["genesis"],
            },
            {
              id: "flare-1",
              slug: "bfi-flare-2026",
              name: "BFI Flare 2026",
              shortName: "Flare",
              startDate: "2026-03-18",
              endDate: "2026-03-29",
              venues: ["bfi-southbank"],
            },
            {
              id: "lff-1",
              slug: "bfi-lff-2026",
              name: "BFI London Film Festival 2026",
              shortName: "LFF",
              startDate: "2026-10-07",
              endDate: "2026-10-18",
              venues: ["bfi-southbank", "bfi-imax", "curzon-soho", "curzon-mayfair"],
            },
            {
              id: "rd-1",
              slug: "raindance-2026",
              name: "Raindance Film Festival 2026",
              shortName: "Raindance",
              startDate: "2026-06-17",
              endDate: "2026-06-26",
              venues: ["curzon-soho"],
            },
          ]),
        }),
      });
      (db.select as ReturnType<typeof vi.fn>).mockImplementation(mockSelect);

      // Clear and reload cache
      FestivalDetector.clearCache();
      await FestivalDetector.preload();
    });

    afterEach(() => {
      FestivalDetector.clearCache();
    });

    // ── AUTO-confidence tests ────────────────────────────────────

    it("should AUTO-tag screenings at Prince Charles during FrightFest", () => {
      const result = FestivalDetector.detect(
        "prince-charles",
        "Some Random Horror Film",
        new Date("2026-08-28T19:00:00Z")
      );
      expect(result.festivalSlug).toBe("frightfest-2026");
    });

    it("should AUTO-tag screenings at Genesis during LIFF", () => {
      const result = FestivalDetector.detect(
        "genesis",
        "Some Indie Film",
        new Date("2026-04-12T20:00:00Z")
      );
      expect(result.festivalSlug).toBe("liff-2026");
    });

    it("should not tag screenings at Prince Charles outside FrightFest window", () => {
      const result = FestivalDetector.detect(
        "prince-charles",
        "Some Film",
        new Date("2026-09-15T19:00:00Z") // September, after FrightFest
      );
      expect(result.festivalSlug).toBeUndefined();
    });

    // ── TITLE-confidence tests ───────────────────────────────────

    it("should tag BFI Flare screenings by title keyword", () => {
      const result = FestivalDetector.detect(
        "bfi-southbank",
        "BFI Flare: Portrait of a Lady on Fire",
        new Date("2026-03-20T19:00:00Z")
      );
      expect(result.festivalSlug).toBe("bfi-flare-2026");
    });

    it("should tag LFF screenings by title keyword", () => {
      const result = FestivalDetector.detect(
        "bfi-southbank",
        "LFF: The Brutalist",
        new Date("2026-10-10T19:00:00Z")
      );
      expect(result.festivalSlug).toBe("bfi-lff-2026");
    });

    it("should tag by booking URL pattern", () => {
      const result = FestivalDetector.detect(
        "bfi-southbank",
        "Some Film Without Flare in Title",
        new Date("2026-03-22T19:00:00Z"),
        "https://whatson.bfi.org.uk/flare/Online/default.asp?doWork::WScontent::loadArticle=Load&Bession::WScontent::loadArticle::article_id=123"
      );
      expect(result.festivalSlug).toBe("bfi-flare-2026");
    });

    it("should not tag regular BFI screenings during Flare without signals", () => {
      const result = FestivalDetector.detect(
        "bfi-southbank",
        "Regular Film",
        new Date("2026-03-22T19:00:00Z"),
        "https://whatson.bfi.org.uk/Online/default.asp"
      );
      expect(result.festivalSlug).toBeUndefined();
    });

    it("should tag Raindance screenings at Curzon Soho by title", () => {
      const result = FestivalDetector.detect(
        "curzon-soho",
        "Raindance: First Feature",
        new Date("2026-06-20T19:00:00Z")
      );
      expect(result.festivalSlug).toBe("raindance-2026");
    });

    // ── Edge cases ───────────────────────────────────────────────

    it("should not tag screenings at non-festival venues", () => {
      const result = FestivalDetector.detect(
        "electric-cinema",
        "LFF: Some Film",
        new Date("2026-10-10T19:00:00Z")
      );
      expect(result.festivalSlug).toBeUndefined();
    });

    it("should return empty object for screenings outside festival windows", () => {
      const result = FestivalDetector.detect(
        "bfi-southbank",
        "Flare Film",
        new Date("2026-06-20T19:00:00Z") // June, not March
      );
      expect(result).toEqual({});
    });

    it("should handle screenings up to 3 days before festival start", () => {
      // FrightFest starts Aug 27, so Aug 24 should be within the generous window
      const result = FestivalDetector.detect(
        "prince-charles",
        "Pre-Festival Film",
        new Date("2026-08-25T19:00:00Z")
      );
      expect(result.festivalSlug).toBe("frightfest-2026");
    });

    it("should return empty object when cache is not loaded", () => {
      FestivalDetector.clearCache();
      const result = FestivalDetector.detect(
        "prince-charles",
        "Film",
        new Date("2026-08-28T19:00:00Z")
      );
      expect(result).toEqual({});
    });
  });
});
