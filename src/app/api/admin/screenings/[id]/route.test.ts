/**
 * Admin Screenings API Tests
 * Tests Zod validation on PUT and PATCH endpoints
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { auth, currentUser } from "@clerk/nextjs/server";

// Mock database - must be defined inside vi.mock for hoisting
vi.mock("@/db", () => {
  const mockLimit = vi.fn().mockResolvedValue([{ id: "test-screening-id" }]);
  return {
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: mockLimit,
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      // Expose mockLimit for test access
      __mockLimit: mockLimit,
    },
  };
});

// Import after mocks are set up
import { PUT, PATCH, DELETE } from "./route";
import { db } from "@/db";

// Access the mock function
const mockLimit = (db as unknown as { __mockLimit: ReturnType<typeof vi.fn> }).__mockLimit;

// Helper to create mock Request
function createRequest(
  body: unknown,
  method: "PUT" | "PATCH" | "DELETE" = "PUT"
): Request {
  return new Request("http://localhost/api/admin/screenings/test-id", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Helper to create route params
function createParams(id = "test-screening-id"): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("Admin Screenings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(currentUser).mockResolvedValue({
      emailAddresses: [{ emailAddress: "jdwbarge@gmail.com" }],
    } as never);
    // Reset db mock to return existing screening
    mockLimit.mockResolvedValue([{ id: "test-screening-id" }]);
  });

  describe("PUT /api/admin/screenings/[id]", () => {
    describe("authentication", () => {
      it("should return 401 without auth", async () => {
        vi.mocked(auth).mockResolvedValueOnce({ userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

        const response = await PUT(createRequest({}), createParams());

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe("Unauthorized");
      });

      it("should proceed with valid auth", async () => {
        vi.mocked(auth).mockResolvedValueOnce({ userId: "test-user" } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

        const response = await PUT(createRequest({ format: "35mm" }), createParams());

        expect(response.status).toBe(200);
      });
    });

    describe("validation", () => {
      beforeEach(() => {
        vi.mocked(auth).mockResolvedValue({ userId: "test-user" } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
      });

      it("should accept valid body with all optional fields", async () => {
        const body = {
          format: "35mm",
          screen: "Screen 1",
          eventType: "Q&A",
          eventDescription: "Director Q&A",
        };

        const response = await PUT(createRequest(body), createParams());

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
      });

      it("should accept valid datetime (ISO 8601)", async () => {
        const body = {
          datetime: "2026-01-15T14:00:00.000Z",
        };

        const response = await PUT(createRequest(body), createParams());

        expect(response.status).toBe(200);
      });

      it("should reject invalid datetime format", async () => {
        const body = {
          datetime: "not-a-valid-datetime",
        };

        const response = await PUT(createRequest(body), createParams());

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe("Invalid request body");
        expect(data.details).toBeDefined();
      });

      it("should reject invalid filmId (not UUID)", async () => {
        const body = {
          filmId: "not-a-uuid",
        };

        const response = await PUT(createRequest(body), createParams());

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe("Invalid request body");
        expect(data.details.fieldErrors.filmId).toBeDefined();
      });

      it("should accept valid UUID for filmId", async () => {
        // Mock film exists check
        mockLimit
          .mockResolvedValueOnce([{ id: "test-screening-id" }]) // screening exists
          .mockResolvedValueOnce([{ id: "valid-film-id" }]); // film exists

        const body = {
          filmId: "123e4567-e89b-12d3-a456-426614174000",
        };

        const response = await PUT(createRequest(body), createParams());

        expect(response.status).toBe(200);
      });

      it("should reject invalid bookingUrl (not URL)", async () => {
        const body = {
          bookingUrl: "not-a-url",
        };

        const response = await PUT(createRequest(body), createParams());

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe("Invalid request body");
        expect(data.details.fieldErrors.bookingUrl).toBeDefined();
      });

      it("should accept valid URL for bookingUrl", async () => {
        const body = {
          bookingUrl: "https://cinema.example.com/book/123",
        };

        const response = await PUT(createRequest(body), createParams());

        expect(response.status).toBe(200);
      });

      it("should accept null for nullable fields", async () => {
        const body = {
          format: null,
          screen: null,
          eventType: null,
          eventDescription: null,
        };

        const response = await PUT(createRequest(body), createParams());

        expect(response.status).toBe(200);
      });
    });
  });

  describe("PATCH /api/admin/screenings/[id]", () => {
    describe("authentication", () => {
      it("should return 401 without auth", async () => {
        vi.mocked(auth).mockResolvedValueOnce({ userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

        const response = await PATCH(createRequest({}, "PATCH"), createParams());

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe("Unauthorized");
      });
    });

    describe("validation", () => {
      beforeEach(() => {
        vi.mocked(auth).mockResolvedValue({ userId: "test-user" } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
      });

      it("should accept valid body", async () => {
        const body = {
          format: "IMAX",
          screen: "Screen 3",
        };

        const response = await PATCH(createRequest(body, "PATCH"), createParams());

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
      });

      it("should reject invalid datetime format", async () => {
        const body = {
          datetime: "2026/01/15 14:00",
        };

        const response = await PATCH(createRequest(body, "PATCH"), createParams());

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe("Invalid request body");
      });

      it("should accept valid datetime (ISO 8601)", async () => {
        const body = {
          datetime: "2026-01-15T14:00:00.000Z",
        };

        const response = await PATCH(createRequest(body, "PATCH"), createParams());

        expect(response.status).toBe(200);
      });

      it("should accept null for nullable fields", async () => {
        const body = {
          format: null,
          screen: null,
          eventType: null,
        };

        const response = await PATCH(createRequest(body, "PATCH"), createParams());

        expect(response.status).toBe(200);
      });
    });
  });

  describe("DELETE /api/admin/screenings/[id]", () => {
    it("should return 401 without auth", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

      const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), createParams());

      expect(response.status).toBe(401);
    });

    it("should succeed with valid auth", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: "test-user" } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

      const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), createParams());

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("should return 404 for non-existent screening", async () => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: "test-user" } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
      mockLimit.mockResolvedValueOnce([]); // No screening found

      const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), createParams());

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("Screening not found");
    });
  });
});
