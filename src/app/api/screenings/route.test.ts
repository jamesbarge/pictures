import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 99, resetIn: 60 }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: {
    public: { limit: 100, windowSec: 60 },
    search: { limit: 30, windowSec: 60 },
  },
}));

vi.mock("@/db/repositories", () => ({
  getScreenings: vi.fn().mockResolvedValue([]),
  getScreeningsWithCursor: vi.fn().mockResolvedValue({ screenings: [], cursor: null, hasMore: false }),
  getScreeningsByFestival: vi.fn().mockResolvedValue({ festival: { id: "festival-1" }, screenings: [] }),
  getScreeningsBySeason: vi.fn().mockResolvedValue({ season: { id: "season-1", name: "Season" }, screenings: [] }),
}));

import { GET } from "./route";
import { checkRateLimit } from "@/lib/rate-limit";
import { getScreenings } from "@/db/repositories";

describe("Screenings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rate limiting", () => {
    it("should return 200 when rate limit passes", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        success: true,
        remaining: 99,
        resetIn: 60,
      });

      const request = new NextRequest("http://localhost/api/screenings");
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(checkRateLimit).toHaveBeenCalledWith(
        "127.0.0.1",
        expect.objectContaining({ limit: 100, windowSec: 60, prefix: "screenings" })
      );
    });

    it("should return 429 when rate limit exceeded", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        success: false,
        remaining: 0,
        resetIn: 45,
      });

      const request = new NextRequest("http://localhost/api/screenings");
      const response = await GET(request);

      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.error).toBe("Too many requests");
      expect(data.screenings).toEqual([]);
    });

    it("should include Retry-After header on 429", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        success: false,
        remaining: 0,
        resetIn: 30,
      });

      const request = new NextRequest("http://localhost/api/screenings");
      const response = await GET(request);

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("30");
    });
  });

  it("returns film tmdbPopularity from the screenings payload", async () => {
    vi.mocked(getScreenings).mockResolvedValueOnce([
      {
        id: "screening-1",
        datetime: new Date("2026-04-23T19:00:00.000Z"),
        format: null,
        screen: null,
        eventType: null,
        eventDescription: null,
        bookingUrl: "https://example.com/book",
        isFestivalScreening: false,
        availabilityStatus: null,
        hasSubtitles: false,
        hasAudioDescription: false,
        isRelaxedScreening: false,
        film: {
          id: "film-1",
          title: "Test Film",
          year: 2024,
          directors: ["Director"],
          genres: ["drama"],
          posterUrl: null,
          runtime: 120,
          isRepertory: false,
          letterboxdRating: 4.1,
          tmdbPopularity: 73.5,
          contentType: "film",
          tmdbRating: 7.9,
        },
        cinema: {
          id: "cinema-1",
          name: "Cinema",
          shortName: "CIN",
        },
      },
    ]);

    const request = new NextRequest("http://localhost/api/screenings");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.screenings[0].film.tmdbPopularity).toBe(73.5);
  });
});
