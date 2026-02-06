/**
 * Tests for AI Verify API route
 * Tests the anomaly verification endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock create function we can control per test
const mockCreate = vi.fn();

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

// Mock Anthropic SDK with a proper class
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockCreate,
      };
    },
  };
});

// Mock database
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() =>
            Promise.resolve([
              {
                id: "bfi-southbank",
                name: "BFI Southbank",
                website: "https://whatson.bfi.org.uk",
                chain: null,
              },
            ])
          ),
          groupBy: vi.fn(() => Promise.resolve([{ count: 25 }])),
        })),
      })),
    })),
  },
}));

import { auth, currentUser } from "@clerk/nextjs/server";

describe("POST /api/admin/anomalies/verify", () => {
  let POST: (request: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(currentUser).mockResolvedValue({
      emailAddresses: [{ emailAddress: "jdwbarge@gmail.com" }],
    } as never);
    // Import fresh module
    const module = await import("./route");
    POST = module.POST;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as unknown as Awaited<ReturnType<typeof auth>>);

    const request = new Request("http://localhost/api/admin/anomalies/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cinemaId: "bfi-southbank",
        anomalyType: "low_count",
        todayCount: 5,
        lastWeekCount: 15,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 when missing required fields", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);

    const request = new Request("http://localhost/api/admin/anomalies/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cinemaId: "bfi-southbank",
        // Missing anomalyType
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Missing required fields");
  });

  it("returns analysis with confidence when AI succeeds", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);

    // Mock successful AI response with high confidence
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            analysis: "The cinema website may have changed its structure.",
            confidence: 0.85,
            suggestedAction: "Re-run the scraper and check for selector changes.",
          }),
        },
      ],
    });

    const request = new Request("http://localhost/api/admin/anomalies/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cinemaId: "bfi-southbank",
        anomalyType: "low_count",
        todayCount: 5,
        lastWeekCount: 15,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.analysis).toBeDefined();
    expect(data.confidence).toBeGreaterThanOrEqual(0);
    expect(data.confidence).toBeLessThanOrEqual(1);
    expect(data.model).toBe("haiku");
  });

  it("escalates to Sonnet when Haiku confidence is low", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);

    // First call (Haiku) returns low confidence
    // Second call (Sonnet) returns high confidence
    mockCreate
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              analysis: "Uncertain about the cause.",
              confidence: 0.5,
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              analysis: "After deeper analysis, this appears to be a website change.",
              confidence: 0.9,
              suggestedAction: "Update selectors.",
            }),
          },
        ],
      });

    const request = new Request("http://localhost/api/admin/anomalies/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cinemaId: "bfi-southbank",
        anomalyType: "zero_results",
        todayCount: 0,
        lastWeekCount: 20,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.model).toBe("sonnet");
    expect(data.confidence).toBeGreaterThan(0.7);
  });

  it("handles AI response with markdown code block", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as unknown as Awaited<ReturnType<typeof auth>>);

    // Mock AI response wrapped in code block
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '```json\n{"analysis": "Test analysis", "confidence": 0.8}\n```',
        },
      ],
    });

    const request = new Request("http://localhost/api/admin/anomalies/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cinemaId: "bfi-southbank",
        anomalyType: "high_variance",
        todayCount: 50,
        lastWeekCount: 15,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.analysis).toBe("Test analysis");
    expect(data.confidence).toBe(0.8);
  });
});
