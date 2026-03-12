import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the db module
vi.mock("@/db", () => ({
  db: {
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "1" }, { id: "2" }])),
      })),
    })),
    selectDistinct: vi.fn(() => ({
      from: vi.fn(() => Promise.resolve([{ filmId: "film-1" }])),
    })),
  },
}));

// Mock schema
vi.mock("@/db/schema", () => ({
  screenings: {
    datetime: "datetime",
    filmId: "filmId",
    id: "id",
  },
  films: {
    id: "id",
  },
}));

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  lt: vi.fn((field, value) => ({ field, value })),
  notInArray: vi.fn((field, values) => ({ field, values })),
  sql: vi.fn(),
}));

describe("Cleanup Cron Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject unauthorized requests in production", async () => {
    // Set production mode
    const originalEnv = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");

    // Import the route handler
    const { GET } = await import("./route");

    const request = new NextRequest("http://localhost/api/cron/cleanup");
    const response = await GET(request);

    expect(response.status).toBe(401);

    // Restore env
    vi.stubEnv("NODE_ENV", originalEnv ?? "test");
  });

  it("should accept requests with valid CRON_SECRET in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "test-secret");

    // Re-import to get fresh module
    vi.resetModules();
    const { GET } = await import("./route");

    const request = new NextRequest("http://localhost/api/cron/cleanup", {
      headers: {
        authorization: "Bearer test-secret",
      },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.results).toBeDefined();

    vi.stubEnv("NODE_ENV", "test");
  });

  it("should reject requests without auth in all environments", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();

    const { GET } = await import("./route");

    const request = new NextRequest("http://localhost/api/cron/cleanup");
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("should return cleanup results", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.resetModules();

    const { GET } = await import("./route");

    const request = new NextRequest("http://localhost/api/cron/cleanup", {
      headers: {
        authorization: "Bearer test-secret",
      },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(body.results).toHaveProperty("pastScreeningsRemoved");
    expect(body.results).toHaveProperty("orphanedFilmsRemoved");
    expect(body.results).toHaveProperty("errors");
    expect(body.timestamp).toBeDefined();
  });
});
