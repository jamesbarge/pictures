/**
 * Tests for Agent API routes
 * Tests link validator, scraper health, and enrichment endpoints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

// Mock the agents
vi.mock("@/agents", () => ({
  verifySampleOfUpcomingLinks: vi.fn(),
  runHealthCheckAllCinemas: vi.fn(),
  enrichUnmatchedFilms: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import {
  verifySampleOfUpcomingLinks,
  runHealthCheckAllCinemas,
  enrichUnmatchedFilms,
} from "@/agents";

describe("Agent API Routes", () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set API key so routes don't return "not configured" error
    process.env.ANTHROPIC_API_KEY = "test-api-key";
  });

  afterEach(() => {
    vi.resetModules();
    // Restore original env
    process.env.ANTHROPIC_API_KEY = originalEnv;
  });

  describe("POST /api/admin/agents/links", () => {
    let POST: () => Promise<Response>;

    beforeEach(async () => {
      const module = await import("./links/route");
      POST = module.POST;
    });

    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: null } as unknown as Awaited<ReturnType<typeof auth>>);

      const response = await POST();
      expect(response.status).toBe(401);
    });

    it("returns link verification results", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
      vi.mocked(verifySampleOfUpcomingLinks).mockResolvedValue({
        success: true,
        data: [
          { screeningId: "1", url: "https://example.com/1", status: "verified", confidence: 0.9, checkedAt: new Date() },
          { screeningId: "2", url: "https://example.com/2", status: "broken", confidence: 0.8, checkedAt: new Date() },
        ],
        tokensUsed: 100,
        executionTimeMs: 5000,
        agentName: "link-verification",
        timestamp: new Date(),
      });

      const response = await POST();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.summary).toContain("Verified 2 links");
      expect(data.summary).toContain("1 valid");
      expect(data.summary).toContain("1 broken");
    });

    it("handles agent errors gracefully", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
      vi.mocked(verifySampleOfUpcomingLinks).mockResolvedValue({
        success: false,
        error: "Database connection failed",
        tokensUsed: 0,
        executionTimeMs: 100,
        agentName: "link-verification",
        timestamp: new Date(),
      });

      const response = await POST();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe("Database connection failed");
    });
  });

  describe("POST /api/admin/agents/health", () => {
    let POST: () => Promise<Response>;

    beforeEach(async () => {
      const module = await import("./health/route");
      POST = module.POST;
    });

    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: null } as unknown as Awaited<ReturnType<typeof auth>>);

      const response = await POST();
      expect(response.status).toBe(401);
    });

    it("returns health check results", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
      vi.mocked(runHealthCheckAllCinemas).mockResolvedValue({
        success: true,
        data: [
          {
            cinemaId: "bfi-southbank",
            cinemaName: "BFI Southbank",
            scrapedAt: new Date(),
            screeningCount: 50,
            averageCountLast7Days: 45,
            percentChange: 11,
            anomalyScore: 0.1,
            anomalyDetected: false,
            warnings: [],
            shouldBlockScrape: false,
            recommendation: "",
          },
          {
            cinemaId: "prince-charles",
            cinemaName: "Prince Charles",
            scrapedAt: new Date(),
            screeningCount: 5,
            averageCountLast7Days: 30,
            percentChange: -83,
            anomalyScore: 0.9,
            anomalyDetected: true,
            warnings: ["Large drop: -83% from average"],
            shouldBlockScrape: true,
            recommendation: "Check scraper",
          },
        ],
        tokensUsed: 200,
        executionTimeMs: 10000,
        agentName: "scraper-health",
        timestamp: new Date(),
      });

      const response = await POST();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.summary).toContain("Checked 2 cinemas");
      expect(data.summary).toContain("1 healthy");
      expect(data.summary).toContain("1 anomalies");
      expect(data.details).toContain("Prince Charles: Large drop: -83% from average");
    });
  });

  describe("POST /api/admin/agents/enrich", () => {
    let POST: () => Promise<Response>;

    beforeEach(async () => {
      const module = await import("./enrich/route");
      POST = module.POST;
    });

    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: null } as unknown as Awaited<ReturnType<typeof auth>>);

      const response = await POST();
      expect(response.status).toBe(401);
    });

    it("returns enrichment results", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
      vi.mocked(enrichUnmatchedFilms).mockResolvedValue({
        success: true,
        data: [
          {
            filmId: "film-1",
            originalTitle: "The Godfather",
            tmdbId: 238,
            matchedTitle: "The Godfather",
            confidence: 0.95,
            matchStrategy: "exact",
            shouldAutoApply: true,
          },
          {
            filmId: "film-2",
            originalTitle: "Some Obscure Film",
            tmdbId: 12345,
            matchedTitle: "Some Film",
            confidence: 0.6,
            matchStrategy: "fuzzy",
            shouldAutoApply: false,
          },
        ],
        tokensUsed: 300,
        executionTimeMs: 15000,
        agentName: "enrichment",
        timestamp: new Date(),
      });

      const response = await POST();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.summary).toContain("Found 2 matches");
      expect(data.summary).toContain("1 auto-applied");
      expect(data.summary).toContain("1 need review");
    });

    it("handles empty results", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
      vi.mocked(enrichUnmatchedFilms).mockResolvedValue({
        success: true,
        data: [],
        tokensUsed: 50,
        executionTimeMs: 2000,
        agentName: "enrichment",
        timestamp: new Date(),
      });

      const response = await POST();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.summary).toContain("Found 0 matches");
    });
  });
});
