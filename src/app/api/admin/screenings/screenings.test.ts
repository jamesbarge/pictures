/**
 * Tests for Admin Screenings API routes
 * Tests POST for creating screenings, PUT for editing, DELETE for removing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

// Mock nanoid
vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "test-screening-id"),
}));

// Mock database
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockSelect,
        }),
      }),
    }),
    insert: () => ({
      values: mockInsert,
    }),
    update: () => ({
      set: () => ({
        where: mockUpdate,
      }),
    }),
    delete: () => ({
      where: mockDelete,
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  screenings: { id: "id", filmId: "film_id", cinemaId: "cinema_id" },
  films: { id: "id" },
  cinemas: { id: "id" },
}));

import { auth, currentUser } from "@clerk/nextjs/server";

describe("Admin Screenings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(currentUser).mockResolvedValue({
      emailAddresses: [{ emailAddress: "jdwbarge@gmail.com" }],
    } as never);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("POST /api/admin/screenings", () => {
    let POST: (request: Request) => Promise<Response>;

    beforeEach(async () => {
      const module = await import("./route");
      POST = module.POST;
    });

    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: null } as never);

      const request = new Request("http://localhost/api/admin/screenings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filmId: "film-1",
          cinemaId: "cinema-1",
          datetime: "2025-01-15T19:00:00Z",
          bookingUrl: "https://example.com/book",
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it("returns 400 when missing required fields", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);

      const request = new Request("http://localhost/api/admin/screenings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filmId: "film-1",
          // Missing cinemaId, datetime, bookingUrl
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain("Missing required fields");
    });

    it("returns 404 when film not found", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
      mockSelect.mockResolvedValueOnce([]); // Film not found

      const request = new Request("http://localhost/api/admin/screenings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filmId: "nonexistent-film",
          cinemaId: "cinema-1",
          datetime: "2025-01-15T19:00:00Z",
          bookingUrl: "https://example.com/book",
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Film not found");
    });

    it("returns 404 when cinema not found", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
      mockSelect
        .mockResolvedValueOnce([{ id: "film-1" }]) // Film exists
        .mockResolvedValueOnce([]); // Cinema not found

      const request = new Request("http://localhost/api/admin/screenings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filmId: "film-1",
          cinemaId: "nonexistent-cinema",
          datetime: "2025-01-15T19:00:00Z",
          bookingUrl: "https://example.com/book",
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Cinema not found");
    });

    it("creates screening successfully", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
      mockSelect
        .mockResolvedValueOnce([{ id: "film-1" }]) // Film exists
        .mockResolvedValueOnce([{ id: "bfi-southbank" }]); // Cinema exists
      mockInsert.mockResolvedValueOnce({ rowCount: 1 });

      const request = new Request("http://localhost/api/admin/screenings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filmId: "film-1",
          cinemaId: "bfi-southbank",
          datetime: "2025-01-15T19:00:00Z",
          bookingUrl: "https://bfi.org.uk/book",
          format: "35mm",
          screen: "NFT1",
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.id).toBe("test-screening-id");
    });
  });

  describe("PUT /api/admin/screenings/[id]", () => {
    let PUT: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

    beforeEach(async () => {
      const module = await import("./[id]/route");
      PUT = module.PUT;
    });

    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: null } as never);

      const request = new Request("http://localhost/api/admin/screenings/screening-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingUrl: "https://new-url.com" }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: "screening-1" }) });
      expect(response.status).toBe(401);
    });

    it("returns 404 when screening not found", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
      mockSelect.mockResolvedValueOnce([]); // Screening not found

      const request = new Request("http://localhost/api/admin/screenings/nonexistent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingUrl: "https://new-url.com" }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: "nonexistent" }) });
      expect(response.status).toBe(404);
    });

    it("updates screening successfully", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
      mockSelect.mockResolvedValueOnce([{ id: "screening-1" }]); // Screening exists
      mockUpdate.mockResolvedValueOnce({ rowCount: 1 });

      const request = new Request("http://localhost/api/admin/screenings/screening-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingUrl: "https://updated-url.com",
          format: "70mm",
        }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: "screening-1" }) });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe("DELETE /api/admin/screenings/[id]", () => {
    let DELETE: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

    beforeEach(async () => {
      const module = await import("./[id]/route");
      DELETE = module.DELETE;
    });

    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: null } as never);

      const request = new Request("http://localhost/api/admin/screenings/screening-1", {
        method: "DELETE",
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: "screening-1" }) });
      expect(response.status).toBe(401);
    });

    it("returns 404 when screening not found", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
      mockSelect.mockResolvedValueOnce([]); // Screening not found

      const request = new Request("http://localhost/api/admin/screenings/nonexistent", {
        method: "DELETE",
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: "nonexistent" }) });
      expect(response.status).toBe(404);
    });

    it("deletes screening successfully", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
      mockSelect.mockResolvedValueOnce([{ id: "screening-1" }]); // Screening exists
      mockDelete.mockResolvedValueOnce({ rowCount: 1 });

      const request = new Request("http://localhost/api/admin/screenings/screening-1", {
        method: "DELETE",
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: "screening-1" }) });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});
