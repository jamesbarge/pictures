import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

const mockLimit = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        orderBy: () => ({
          limit: mockLimit,
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  bfiImportRuns: {
    finishedAt: "finished_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  desc: vi.fn((value) => value),
}));

import { auth, currentUser } from "@clerk/nextjs/server";
import { GET } from "./route";

describe("GET /api/admin/bfi/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(currentUser).mockResolvedValue({
      emailAddresses: [{ emailAddress: "jdwbarge@gmail.com" }],
    } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

    const response = await GET(new Request("http://localhost"), {});

    expect(response.status).toBe(401);
  });

  it("returns null lastRun when no run exists", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
    mockLimit.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost"), {});
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.lastRun).toBeNull();
    expect(typeof data.nextScheduledRun).toBe("string");
    expect(typeof data.schedule.nextFullImportAt).toBe("string");
    expect(typeof data.schedule.nextProgrammeChangesAt).toBe("string");
  });

  it("returns the latest persisted run", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
    mockLimit.mockResolvedValue([
      {
        id: "run-1",
        runType: "full",
        status: "degraded",
        triggeredBy: "scheduled-bfi-pdf-import",
        startedAt: new Date("2026-02-04T06:00:00.000Z"),
        finishedAt: new Date("2026-02-04T06:01:05.000Z"),
        durationMs: 65000,
        sourceStatus: { pdf: "failed", programmeChanges: "success" },
        pdfScreenings: 0,
        changesScreenings: 42,
        totalScreenings: 42,
        added: 30,
        updated: 12,
        failed: 0,
        errorCodes: ["PDF_FETCH_PARSE_FAILED"],
        errors: ["PDF fetch/parse failed: Error: blocked"],
      },
    ]);

    const response = await GET(new Request("http://localhost"), {});
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.lastRun).toBeTruthy();
    expect(data.lastRun.status).toBe("degraded");
    expect(data.lastRun.sourceStatus).toEqual({
      pdf: "failed",
      programmeChanges: "success",
    });
    expect(data.lastRun.screenings.total).toBe(42);
    expect(data.lastRun.errorCodes).toContain("PDF_FETCH_PARSE_FAILED");
  });
});
