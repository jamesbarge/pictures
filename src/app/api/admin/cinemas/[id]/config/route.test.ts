/**
 * Tests for Cinema Config API route
 * Tests GET and PUT for cinema baseline configuration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

// Mock database
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockSelect,
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: mockUpdate,
      }),
    }),
    insert: () => ({
      values: mockInsert,
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  cinemaBaselines: { cinemaId: "cinema_id" },
  cinemas: { id: "id" },
}));

import { auth, currentUser } from "@clerk/nextjs/server";

describe("Cinema Config API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(currentUser).mockResolvedValue({
      emailAddresses: [{ emailAddress: "jdwbarge@gmail.com" }],
    } as never);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("GET /api/admin/cinemas/[id]/config", () => {
    let GET: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

    beforeEach(async () => {
      const module = await import("./route");
      GET = module.GET;
    });

    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: null } as unknown as Awaited<ReturnType<typeof auth>>);

      const request = new Request("http://localhost/api/admin/cinemas/bfi-southbank/config");
      const response = await GET(request, { params: Promise.resolve({ id: "bfi-southbank" }) });

      expect(response.status).toBe(401);
    });

    it("returns 404 when cinema not found", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockSelect.mockResolvedValueOnce([]); // Cinema not found

      const request = new Request("http://localhost/api/admin/cinemas/nonexistent/config");
      const response = await GET(request, { params: Promise.resolve({ id: "nonexistent" }) });

      expect(response.status).toBe(404);
    });

    it("returns existing config when baseline exists", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockSelect
        .mockResolvedValueOnce([{ id: "bfi-southbank" }]) // Cinema exists
        .mockResolvedValueOnce([{
          cinemaId: "bfi-southbank",
          tier: "top",
          tolerancePercent: 25,
          weekdayAvg: 40,
          weekendAvg: 60,
          manualOverride: true,
          notes: "High priority cinema",
        }]); // Baseline exists

      const request = new Request("http://localhost/api/admin/cinemas/bfi-southbank/config");
      const response = await GET(request, { params: Promise.resolve({ id: "bfi-southbank" }) });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.tier).toBe("top");
      expect(data.tolerancePercent).toBe(25);
      expect(data.weekdayAvg).toBe(40);
      expect(data.weekendAvg).toBe(60);
    });

    it("returns defaults when no baseline exists", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockSelect
        .mockResolvedValueOnce([{ id: "prince-charles" }]) // Cinema exists
        .mockResolvedValueOnce([]); // No baseline

      const request = new Request("http://localhost/api/admin/cinemas/prince-charles/config");
      const response = await GET(request, { params: Promise.resolve({ id: "prince-charles" }) });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.tier).toBe("standard");
      expect(data.tolerancePercent).toBe(30);
      expect(data.weekdayAvg).toBeNull();
      expect(data.weekendAvg).toBeNull();
      expect(data.manualOverride).toBe(false);
    });
  });

  describe("PUT /api/admin/cinemas/[id]/config", () => {
    let PUT: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

    beforeEach(async () => {
      const module = await import("./route");
      PUT = module.PUT;
    });

    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: null } as unknown as Awaited<ReturnType<typeof auth>>);

      const request = new Request("http://localhost/api/admin/cinemas/bfi-southbank/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "top" }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: "bfi-southbank" }) });

      expect(response.status).toBe(401);
    });

    it("returns 400 for invalid tier", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);

      const request = new Request("http://localhost/api/admin/cinemas/bfi-southbank/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "invalid" }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: "bfi-southbank" }) });

      expect(response.status).toBe(400);
    });

    it("returns 400 for tolerancePercent below 10", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);

      const request = new Request("http://localhost/api/admin/cinemas/bfi-southbank/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tolerancePercent: 5 }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: "bfi-southbank" }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid request body");
      expect(data.details.fieldErrors.tolerancePercent).toBeDefined();
    });

    it("returns 400 for tolerancePercent above 100", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);

      const request = new Request("http://localhost/api/admin/cinemas/bfi-southbank/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tolerancePercent: 150 }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: "bfi-southbank" }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid request body");
      expect(data.details.fieldErrors.tolerancePercent).toBeDefined();
    });

    it("returns 400 for scrapeHorizonDays below 7", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);

      const request = new Request("http://localhost/api/admin/cinemas/bfi-southbank/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scrapeHorizonDays: 3 }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: "bfi-southbank" }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid request body");
      expect(data.details.fieldErrors.scrapeHorizonDays).toBeDefined();
    });

    it("returns 400 for scrapeHorizonDays above 365", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);

      const request = new Request("http://localhost/api/admin/cinemas/bfi-southbank/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scrapeHorizonDays: 400 }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: "bfi-southbank" }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid request body");
      expect(data.details.fieldErrors.scrapeHorizonDays).toBeDefined();
    });

    it("returns 400 for invalid maxScrapeDate", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);

      const request = new Request("http://localhost/api/admin/cinemas/bfi-southbank/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxScrapeDate: "not-a-date" }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: "bfi-southbank" }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid request body");
      expect(data.details.fieldErrors.maxScrapeDate).toBeDefined();
    });

    it("accepts valid maxScrapeDate ISO datetime", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockSelect
        .mockResolvedValueOnce([{ id: "bfi-southbank" }]) // Cinema exists
        .mockResolvedValueOnce([]); // No baseline exists
      mockInsert.mockResolvedValueOnce({ rowCount: 1 });

      const request = new Request("http://localhost/api/admin/cinemas/bfi-southbank/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxScrapeDate: "2026-06-15T00:00:00.000Z" }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: "bfi-southbank" }) });

      expect(response.status).toBe(200);
    });

    it("accepts null for nullable fields", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockSelect
        .mockResolvedValueOnce([{ id: "bfi-southbank" }]) // Cinema exists
        .mockResolvedValueOnce([]); // No baseline exists
      mockInsert.mockResolvedValueOnce({ rowCount: 1 });

      const request = new Request("http://localhost/api/admin/cinemas/bfi-southbank/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekdayAvg: null,
          weekendAvg: null,
          notes: null,
          maxScrapeDate: null,
        }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: "bfi-southbank" }) });

      expect(response.status).toBe(200);
    });

    it("accepts boundary values for tolerancePercent", async () => {
      for (const tolerancePercent of [10, 100]) {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
        mockSelect
          .mockResolvedValueOnce([{ id: "bfi-southbank" }])
          .mockResolvedValueOnce([]);
        mockInsert.mockResolvedValueOnce({ rowCount: 1 });

        const request = new Request("http://localhost/api/admin/cinemas/bfi-southbank/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tolerancePercent }),
        });
        const response = await PUT(request, { params: Promise.resolve({ id: "bfi-southbank" }) });
        expect(response.status).toBe(200);
      }
    });

    it("accepts boundary values for scrapeHorizonDays", async () => {
      for (const scrapeHorizonDays of [7, 365]) {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
        mockSelect
          .mockResolvedValueOnce([{ id: "bfi-southbank" }])
          .mockResolvedValueOnce([]);
        mockInsert.mockResolvedValueOnce({ rowCount: 1 });

        const request = new Request("http://localhost/api/admin/cinemas/bfi-southbank/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scrapeHorizonDays }),
        });
        const response = await PUT(request, { params: Promise.resolve({ id: "bfi-southbank" }) });
        expect(response.status).toBe(200);
      }
    });

    it("updates existing baseline", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockSelect
        .mockResolvedValueOnce([{ id: "bfi-southbank" }]) // Cinema exists
        .mockResolvedValueOnce([{ cinemaId: "bfi-southbank" }]); // Baseline exists
      mockUpdate.mockResolvedValueOnce({ rowCount: 1 });

      const request = new Request("http://localhost/api/admin/cinemas/bfi-southbank/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: "top",
          tolerancePercent: 20,
          weekdayAvg: 35,
          weekendAvg: 50,
        }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: "bfi-southbank" }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("creates new baseline when none exists", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
      mockSelect
        .mockResolvedValueOnce([{ id: "new-cinema" }]) // Cinema exists
        .mockResolvedValueOnce([]); // No baseline exists
      mockInsert.mockResolvedValueOnce({ rowCount: 1 });

      const request = new Request("http://localhost/api/admin/cinemas/new-cinema/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: "standard",
          tolerancePercent: 50,
        }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: "new-cinema" }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});
