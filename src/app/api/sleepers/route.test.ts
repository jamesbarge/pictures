import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => {
  const checkRateLimit = vi.fn().mockResolvedValue({
    success: true,
    remaining: 99,
    resetIn: 60,
  });
  return {
    checkRateLimit,
    getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
    withRateLimit:
      (config: { limit: number; windowSec: number }, prefix: string) =>
      (handler: (request: Request, ...args: unknown[]) => Promise<Response>) =>
      async (request: Request, ...args: unknown[]) => {
        const result = await checkRateLimit("127.0.0.1", { ...config, prefix });
        if (!result.success) {
          return Response.json(
            { error: "Too many requests", code: "RATE_LIMITED" },
            { status: 429, headers: { "Retry-After": String(result.resetIn) } }
          );
        }
        return handler(request, ...args);
      },
    RATE_LIMITS: {
      public: { limit: 100, windowSec: 60 },
      search: { limit: 30, windowSec: 60 },
    },
  };
});

vi.mock("@/db/repositories", () => ({
  getStoredPicks: vi.fn().mockResolvedValue([]),
  computePicksForDates: vi.fn().mockResolvedValue([]),
}));

import { GET } from "./route";
import { londonDateString, addDaysToDateString } from "@/lib/london-date";
import { computePicksForDates, getStoredPicks } from "@/db/repositories";

const today = () => londonDateString(new Date());

function pick(date: string, filmId: string, source: "precomputed" | "fallback") {
  return {
    date,
    filmId,
    cooldownKey: filmId,
    score: 3.45,
    letterboxdRating: 4.29,
    tmdbVoteCount: 622,
    source,
  };
}

describe("Sleepers API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStoredPicks).mockResolvedValue([]);
    vi.mocked(computePicksForDates).mockResolvedValue([]);
  });

  it("returns 200 with an empty map when nothing qualifies", async () => {
    // An empty editorial slot is not a broken route — this must never 404.
    const res = await GET(new NextRequest("http://localhost/api/sleepers"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.picks).toEqual({});
  });

  it("keys picks by London date and exposes the film id", async () => {
    const d = today();
    vi.mocked(getStoredPicks).mockResolvedValue([pick(d, "film-1", "precomputed")]);

    const res = await GET(new NextRequest("http://localhost/api/sleepers?days=1"));
    const body = await res.json();

    expect(body.picks[d].filmId).toBe("film-1");
    expect(body.picks[d].source).toBe("precomputed");
  });

  it("caches for an hour", async () => {
    // The response is a whole-window map starting at today, so an hour-stale
    // copy still contains the correct entry for the client's current day.
    const res = await GET(new NextRequest("http://localhost/api/sleepers"));
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });

  describe("fallback", () => {
    it("recomputes only the dates the stored set does not cover", async () => {
      const d0 = today();
      const d1 = addDaysToDateString(d0, 1);
      const d2 = addDaysToDateString(d0, 2);
      vi.mocked(getStoredPicks).mockResolvedValue([pick(d1, "stored", "precomputed")]);
      vi.mocked(computePicksForDates).mockResolvedValue([pick(d0, "computed", "fallback")]);

      const res = await GET(new NextRequest("http://localhost/api/sleepers?days=3"));
      const body = await res.json();

      // d1 was stored, so only d0 and d2 should be recomputed.
      expect(vi.mocked(computePicksForDates).mock.calls[0][0]).toEqual([d0, d2]);
      expect(body.picks[d0].source).toBe("fallback");
      expect(body.picks[d1].source).toBe("precomputed");
    });

    it("reports the fallback count so a dead pipeline is observable", async () => {
      const d0 = today();
      vi.mocked(computePicksForDates).mockResolvedValue([pick(d0, "computed", "fallback")]);

      const res = await GET(new NextRequest("http://localhost/api/sleepers?days=1"));
      const body = await res.json();

      expect(body.meta.fallbackCount).toBe(1);
    });

    it("does not call the fallback when every date is stored", async () => {
      const d0 = today();
      vi.mocked(getStoredPicks).mockResolvedValue([pick(d0, "stored", "precomputed")]);

      await GET(new NextRequest("http://localhost/api/sleepers?days=1"));

      expect(computePicksForDates).not.toHaveBeenCalled();
    });
  });

  describe("query validation", () => {
    it.each([
      ["zero", "0"],
      ["negative", "-1"],
      ["over the 21-day cap", "22"],
      ["not a number", "banana"],
      ["fractional", "1.5"],
    ])("rejects days=%s", async (_label, days) => {
      const res = await GET(new NextRequest(`http://localhost/api/sleepers?days=${days}`));
      expect(res.status).toBe(400);
    });

    it("defaults to 14 days when omitted", async () => {
      const res = await GET(new NextRequest("http://localhost/api/sleepers"));
      const body = await res.json();
      expect(body.meta.from).toBe(today());
      expect(body.meta.to).toBe(addDaysToDateString(today(), 13));
    });
  });

  it("returns 429 when the rate limit trips", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      success: false,
      remaining: 0,
      resetIn: 60,
    } as Awaited<ReturnType<typeof checkRateLimit>>);

    const res = await GET(new NextRequest("http://localhost/api/sleepers"));
    expect(res.status).toBe(429);
  });

  it("surfaces repository failures as a handled error, not a crash", async () => {
    vi.mocked(getStoredPicks).mockRejectedValue(new Error("db down"));
    const res = await GET(new NextRequest("http://localhost/api/sleepers"));
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
