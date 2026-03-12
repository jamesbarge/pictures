/**
 * Search API Tests
 * Tests rate limiting on GET endpoint
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock rate limiting
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 29, resetIn: 60 }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: {
    public: { limit: 100, windowSec: 60 },
    search: { limit: 30, windowSec: 60 },
  },
}));

// Mock database
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/db/schema", () => ({
  screenings: {},
  films: {},
}));

import { GET } from "./route";
import { checkRateLimit } from "@/lib/rate-limit";

describe("Search API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rate limiting", () => {
    it("should return 200 when rate limit passes", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        success: true,
        remaining: 29,
        resetIn: 60,
      });

      const request = new NextRequest("http://localhost/api/search?q=test");
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(checkRateLimit).toHaveBeenCalledWith(
        "127.0.0.1",
        expect.objectContaining({ limit: 30, windowSec: 60, prefix: "search-legacy" })
      );
    });

    it("should return 429 when rate limit exceeded", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        success: false,
        remaining: 0,
        resetIn: 45,
      });

      const request = new NextRequest("http://localhost/api/search?q=test");
      const response = await GET(request);

      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.error).toBe("Too many requests");
      expect(data.films).toEqual([]);
    });

    it("should include Retry-After header on 429", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        success: false,
        remaining: 0,
        resetIn: 25,
      });

      const request = new NextRequest("http://localhost/api/search?q=test");
      const response = await GET(request);

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("25");
    });

    it("should return empty array for short queries even without rate limit", async () => {
      vi.mocked(checkRateLimit).mockResolvedValueOnce({
        success: true,
        remaining: 29,
        resetIn: 60,
      });

      const request = new NextRequest("http://localhost/api/search?q=a");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.films).toEqual([]);
    });
  });
});
