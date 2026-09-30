/** Real pipeline orchestration with external boundaries mocked; no SQL execution. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  inserted: vi.fn(),
  updated: vi.fn(),
  phase: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    execute: mocks.execute,
    insert: () => ({ values: (values: unknown) => ({
      onConflictDoUpdate: async () => { mocks.inserted(values); },
    }) }),
    update: () => ({ set: (values: unknown) => ({
      where: async () => { mocks.updated(values); },
    }) }),
  },
  withDbTimeout: <T,>(p: Promise<T>) => p,
}));
vi.mock("./runner-factory", () => ({ isConnectionError: () => false }));
vi.mock("@/lib/scrape-progress", () => ({
  stampProgress: async () => {},
  runPhase: async (_id: string, phase: string, fn: () => Promise<unknown>) => {
    mocks.phase(phase);
    return fn();
  },
}));
vi.mock("./utils/scrape-diff", () => ({
  generateScrapeDiff: async () => undefined,
  printDiffReport: vi.fn(),
  shouldBlockScrape: () => false,
}));
vi.mock("@/lib/title-extraction", () => ({
  batchExtractTitles: async () => new Map(),
  extractFilmTitleCached: async (title: string) => ({ filmTitle: title, confidence: "high" }),
}));
vi.mock("./utils/film-matching", () => ({
  initFilmCache: async () => ({}),
  lookupFilmInCache: () => ({ id: "film-tony", posterUrl: "https://example.com/poster.jpg" }),
  logCacheStats: vi.fn(),
}));
vi.mock("./utils/screening-classification", () => ({
  classifyScreening: async () => ({}),
  checkForDuplicate: async () => ({ duplicate: null, shouldSkip: false }),
}));
vi.mock("./seasons/season-linker", () => ({ linkFilmToMatchingSeasons: async () => 0 }));

import { processScreenings } from "./pipeline";

const screening = {
  filmTitle: "Tony",
  datetime: new Date("2026-09-09T19:30:00Z"), // 20:30 BST
  bookingUrl: "https://example.com/book/tony-2030",
  sourceId: "tony-2030",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.execute.mockReset().mockResolvedValue([{ count: 1 }]);
  mocks.inserted.mockClear();
  mocks.updated.mockClear();
  mocks.phase.mockClear();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("audit integration: writes followed by report-only diagnostics", () => {
  it("persists the captured screening and reports candidates without emitting DELETE", async () => {
    const result = await processScreenings("peckhamplex", [screening]);
    expect(result).toMatchObject({ added: 1, updated: 0, failed: 0, supersededCandidates: 1 });
    expect(mocks.inserted).toHaveBeenCalledWith(expect.objectContaining({
      cinemaId: "peckhamplex", sourceId: "tony-2030", datetime: screening.datetime,
    }));
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0] as SQL);
    expect(query.sql.trim()).toMatch(/^SELECT COUNT/);
    expect(query.sql).not.toMatch(/\b(DELETE|UPDATE|INSERT|TRUNCATE)\b/i);
    expect(mocks.phase).toHaveBeenCalledWith("report-superseded-candidates");
    expect(mocks.updated).toHaveBeenCalledWith(expect.objectContaining({ lastScrapedAt: result.scrapedAt }));
  });

  it("preserves successful writes and the final timestamp when the report fails", async () => {
    mocks.execute.mockRejectedValue(new Error("diagnostic timeout"));
    const result = await processScreenings("peckhamplex", [screening]);
    expect(result).toMatchObject({ added: 1, failed: 0, blocked: false });
    expect(result.supersededCandidates).toBeUndefined();
    expect(mocks.inserted).toHaveBeenCalledTimes(1);
    expect(mocks.updated).toHaveBeenCalledWith(expect.objectContaining({ lastScrapedAt: result.scrapedAt }));
  });

  it("keeps L-CUT partial writes while suppressing the proximity report", async () => {
    const result = await processScreenings("peckhamplex", [screening], { skipSupersededCleanup: true });
    expect(result).toMatchObject({ added: 1, failed: 0 });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("uses the canonical ID for both the screening write and candidate report", async () => {
    const result = await processScreenings("nickel", [screening]);
    expect(result).toMatchObject({ cinemaId: "the-nickel", added: 1 });
    expect(mocks.inserted).toHaveBeenCalledWith(expect.objectContaining({ cinemaId: "the-nickel" }));
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0] as SQL);
    expect(query.params[0]).toBe("the-nickel");
  });
});
