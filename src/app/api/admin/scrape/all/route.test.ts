/**
 * Tests for Re-scan All API route
 * Tests the endpoint that queues all scrapers via Inngest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

// Mock Inngest
const mockSend = vi.fn();
vi.mock("@/inngest/client", () => ({
  inngest: {
    send: mockSend,
  },
}));

import { auth } from "@clerk/nextjs/server";

describe("POST /api/admin/scrape/all", () => {
  let POST: (request: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Import fresh module
    const module = await import("./route");
    POST = module.POST;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as unknown as Awaited<ReturnType<typeof auth>>);

    const request = new Request("http://localhost/api/admin/scrape/all", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("queues all scrapers when authenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
    mockSend.mockResolvedValue({ ids: ["event-1", "event-2"] });

    const request = new Request("http://localhost/api/admin/scrape/all", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.count).toBeGreaterThan(0);
    expect(data.cinemas).toBeInstanceOf(Array);
    expect(data.eventIds).toBeDefined();
  });

  it("includes both independent and chain cinemas", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
    mockSend.mockResolvedValue({ ids: [] });

    const request = new Request("http://localhost/api/admin/scrape/all", {
      method: "POST",
    });

    const response = await POST(request);
    const data = await response.json();

    // Check for some known cinemas
    expect(data.cinemas).toContain("bfi-southbank");
    expect(data.cinemas).toContain("prince-charles");
    expect(data.cinemas).toContain("curzon-soho");
    expect(data.cinemas).toContain("picturehouse-central");
  });

  it("sends scraper/run events to Inngest", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
    mockSend.mockResolvedValue({ ids: [] });

    const request = new Request("http://localhost/api/admin/scrape/all", {
      method: "POST",
    });

    await POST(request);

    // Verify Inngest.send was called
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Check the events structure
    const events = mockSend.mock.calls[0][0];
    expect(events).toBeInstanceOf(Array);
    expect(events.length).toBeGreaterThan(0);

    // Each event should have the correct structure
    events.forEach((event: { name: string; data: { cinemaId: string; scraperId: string; triggeredBy: string } }) => {
      expect(event.name).toBe("scraper/run");
      expect(event.data.cinemaId).toBeDefined();
      expect(event.data.scraperId).toBeDefined();
      expect(event.data.triggeredBy).toBe("user_123");
    });
  });

  it("returns 500 when Inngest fails", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);
    mockSend.mockRejectedValue(new Error("Inngest service unavailable"));

    const request = new Request("http://localhost/api/admin/scrape/all", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toBe("Failed to trigger scrapers");
  });
});
