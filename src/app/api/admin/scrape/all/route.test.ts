/**
 * Tests for Re-scan All API route
 *
 * The route now invokes `runScrapeAll()` in-process (fire-and-forget) and
 * returns 202 immediately. The previous Inngest/Trigger.dev event-fanout
 * tests were obsolete after the local-scraping rebuild — replaced with
 * tests that match the new fire-and-forget contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

// Mock the in-process job runner so the test never actually starts a scrape.
const runScrapeAllMock = vi.fn();
vi.mock("@/lib/jobs/scrape-all", () => ({
  runScrapeAll: runScrapeAllMock,
}));

import { auth, currentUser } from "@clerk/nextjs/server";

describe("POST /api/admin/scrape/all", () => {
  let POST: (request: Request, context: unknown) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(currentUser).mockResolvedValue({
      emailAddresses: [{ emailAddress: "jdwbarge@gmail.com" }],
    } as never);
    runScrapeAllMock.mockResolvedValue({
      durationMin: 0,
      totalSucceeded: 0,
      totalFailed: 0,
      waves: [],
      anomalies: 0,
      failures: 0,
      zeroCounts: 0,
    });
    const module = await import("./route");
    POST = module.POST;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

    const request = new Request("http://localhost/api/admin/scrape/all", {
      method: "POST",
    });

    const response = await POST(request, {});
    expect(response.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
    vi.mocked(currentUser).mockResolvedValue({
      emailAddresses: [{ emailAddress: "someone@example.com" }],
    } as never);

    const request = new Request("http://localhost/api/admin/scrape/all", {
      method: "POST",
    });

    const response = await POST(request, {});
    expect(response.status).toBe(403);
  });

  it("returns 202 with status:started when authenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);

    const request = new Request("http://localhost/api/admin/scrape/all", {
      method: "POST",
    });

    const response = await POST(request, {});
    expect(response.status).toBe(202);

    const data = await response.json();
    expect(data.status).toBe("started");
    expect(data.success).toBe(true);
    expect(data.orchestrator).toBe("local");
    expect(data.triggeredBy).toBe("user_123");
  });

  it("invokes runScrapeAll fire-and-forget — does not block on completion", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);

    // Make runScrapeAll never resolve so the test would hang if the route
    // awaited it. The route should still return 202 quickly.
    runScrapeAllMock.mockImplementation(() => new Promise(() => { /* never */ }));

    const request = new Request("http://localhost/api/admin/scrape/all", {
      method: "POST",
    });

    const response = await POST(request, {});
    expect(response.status).toBe(202);
    expect(runScrapeAllMock).toHaveBeenCalledTimes(1);
  });

  it("does not surface 500 when runScrapeAll rejects asynchronously", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
    runScrapeAllMock.mockRejectedValue(new Error("orchestrator boom"));

    const request = new Request("http://localhost/api/admin/scrape/all", {
      method: "POST",
    });

    const response = await POST(request, {});
    // Fire-and-forget — the promise's rejection is logged but the response
    // is already 202 by then. This is the contract.
    expect(response.status).toBe(202);
  });
});
