import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawScreening } from "../types";

const {
  mockFetchLatestPDF,
  mockParsePDF,
  mockFetchProgrammeChanges,
  mockSaveScreenings,
  mockEnsureCinemaExists,
  mockBfiRunInsertValues,
} = vi.hoisted(() => ({
  mockFetchLatestPDF: vi.fn(),
  mockParsePDF: vi.fn(),
  mockFetchProgrammeChanges: vi.fn(),
  mockSaveScreenings: vi.fn(),
  mockEnsureCinemaExists: vi.fn(),
  mockBfiRunInsertValues: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./fetcher", () => ({
  fetchLatestPDF: mockFetchLatestPDF,
}));

vi.mock("./pdf-parser", () => ({
  parsePDF: mockParsePDF,
}));

vi.mock("./programme-changes-parser", () => ({
  fetchProgrammeChanges: mockFetchProgrammeChanges,
}));

vi.mock("../pipeline", () => ({
  saveScreenings: mockSaveScreenings,
  ensureCinemaExists: mockEnsureCinemaExists,
}));

vi.mock("@/db", () => ({
  isDatabaseAvailable: true,
  db: {
    insert: () => ({
      values: mockBfiRunInsertValues,
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  bfiImportRuns: {},
}));

import { runBFIImport, runProgrammeChangesImport } from "./importer";

function makeScreening(screen: string, title: string, bookingUrl?: string): RawScreening {
  return {
    filmTitle: title,
    datetime: new Date("2030-01-01T18:00:00Z"),
    screen,
    bookingUrl: bookingUrl ?? `https://example.com/${title.toLowerCase().replace(/\s+/g, "-")}`,
  };
}

describe("BFI importer resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SLACK_WEBHOOK_URL;
    mockEnsureCinemaExists.mockResolvedValue(undefined);
    mockSaveScreenings.mockImplementation(async (_cinemaId: string, screenings: RawScreening[]) => ({
      added: screenings.length,
      updated: 0,
      failed: 0,
    }));
  });

  it("returns degraded when PDF fails but programme changes succeeds", async () => {
    mockFetchLatestPDF.mockRejectedValue(new Error("cloudflare blocked"));
    mockFetchProgrammeChanges.mockResolvedValue({
      changes: [],
      screenings: [
        makeScreening("NFT1", "Film One"),
        makeScreening("IMAX", "Film Two"),
      ],
      lastUpdated: "1 Jan",
      parseErrors: [],
    });

    const result = await runBFIImport();

    expect(result.success).toBe(true);
    expect(result.status).toBe("degraded");
    expect(result.sourceStatus).toEqual({
      pdf: "failed",
      programmeChanges: "success",
    });
    expect(result.totalScreenings).toBe(2);
    expect(result.savedScreenings.added).toBe(2);
    expect(result.errorCodes).toContain("PDF_FETCH_PARSE_FAILED");
  });

  it("returns failed when no screenings are found from either source", async () => {
    mockFetchLatestPDF.mockResolvedValue(null);
    mockFetchProgrammeChanges.mockResolvedValue({
      changes: [],
      screenings: [],
      lastUpdated: null,
      parseErrors: [],
    });

    const result = await runBFIImport();

    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.sourceStatus).toEqual({
      pdf: "failed",
      programmeChanges: "empty",
    });
    expect(result.totalScreenings).toBe(0);
    expect(result.errorCodes).toContain("NO_SCREENINGS_PARSED");
  });

  it("returns success for programme-changes import when screenings are saved", async () => {
    mockFetchProgrammeChanges.mockResolvedValue({
      changes: [],
      screenings: [makeScreening("NFT2", "Film Three")],
      lastUpdated: "2 Jan",
      parseErrors: [],
    });

    const result = await runProgrammeChangesImport();

    expect(result.success).toBe(true);
    expect(result.status).toBe("success");
    expect(result.sourceStatus).toEqual({
      pdf: "empty",
      programmeChanges: "success",
    });
    expect(result.changesScreenings).toBe(1);
    expect(result.savedScreenings.added).toBe(1);
    expect(result.errorCodes).toEqual([]);
  });

  it("treats empty programme-changes fetch as successful empty run", async () => {
    mockFetchProgrammeChanges.mockResolvedValue({
      changes: [],
      screenings: [],
      lastUpdated: "3 Jan",
      parseErrors: [],
    });

    const result = await runProgrammeChangesImport();

    expect(result.success).toBe(true);
    expect(result.status).toBe("success");
    expect(result.totalScreenings).toBe(0);
    expect(result.errorCodes).toEqual([]);
    expect(result.sourceStatus).toEqual({
      pdf: "empty",
      programmeChanges: "empty",
    });
  });

  it("keeps duplicate title/time entries when they belong to different venues", async () => {
    mockFetchLatestPDF.mockResolvedValue({
      info: { label: "Latest PDF", url: "https://example.com/latest.pdf" },
      contentHash: "hash-1",
      content: "pdf-bytes",
    });
    mockParsePDF.mockResolvedValue({
      films: [],
      screenings: [
        makeScreening("Unknown", "Shared Film", "https://whatson.bfi.org.uk/imax/shared-film"),
      ],
      parseErrors: [],
    });
    mockFetchProgrammeChanges.mockResolvedValue({
      changes: [],
      screenings: [
        makeScreening("Unknown", "Shared Film", "https://whatson.bfi.org.uk/southbank/shared-film"),
      ],
      lastUpdated: "4 Jan",
      parseErrors: [],
    });

    const result = await runBFIImport();

    expect(result.totalScreenings).toBe(2);
    expect(result.savedScreenings.added).toBe(2);
    expect(mockSaveScreenings).toHaveBeenCalledTimes(2);
  });
});
