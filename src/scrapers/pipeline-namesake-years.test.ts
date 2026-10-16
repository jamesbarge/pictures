/** Release-year plumbing between processScreenings and the film cache; DB and TMDB mocked. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inserted: vi.fn(),
  lookup: vi.fn(),
  tmdb: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    execute: async () => [{ count: 0 }],
    insert: () => ({ values: (values: unknown) => ({
      onConflictDoUpdate: async () => { mocks.inserted(values); },
    }) }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  },
  // A real ceiling, so the year-conflict path's own 8s timeout can fire.
  withDbTimeout: <T,>(p: Promise<T>, ms: number) =>
    Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]),
}));
vi.mock("./runner-factory", () => ({ isConnectionError: () => false }));
vi.mock("@/lib/scrape-progress", () => ({
  stampProgress: async () => {},
  runPhase: async (_id: string, _phase: string, fn: () => Promise<unknown>) => fn(),
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
vi.mock("./utils/screening-classification", () => ({
  classifyScreening: async () => ({}),
  checkForDuplicate: async () => ({ duplicate: null, shouldSkip: false }),
}));
vi.mock("./seasons/season-linker", () => ({ linkFilmToMatchingSeasons: async () => 0 }));
vi.mock("./utils/film-matching", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./utils/film-matching")>()),
  initFilmCache: async () => ({}),
  lookupFilmInCache: mocks.lookup,
  logCacheStats: () => {},
  matchAndCreateFromTMDB: mocks.tmdb,
  tryUpdatePoster: async () => {},
}));

import { processScreenings } from "./pipeline";

const at = (iso: string, sourceId: string, filmTitle: string, year?: number) => ({
  filmTitle,
  datetime: new Date(iso),
  bookingUrl: `https://example.com/${sourceId}`,
  sourceId,
  year,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.inserted.mockClear();
  mocks.lookup.mockReset().mockReturnValue({ id: "cached", year: 2025, posterUrl: "p.jpg" });
  mocks.tmdb.mockReset().mockResolvedValue(null);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("release years reach the film cache", () => {
  it("looks up two same-title films at one venue under their own years", async () => {
    await processScreenings("riverside-studios", [
      at("2026-10-30T20:30:00Z", "hammer", "Dracula", 1958),
      at("2026-10-31T18:00:00Z", "jude", "Dracula", 2025),
    ]);

    expect(mocks.lookup.mock.calls.map((call) => call[2]).sort()).toEqual([1958, 2025]);
  });

  it("keeps a re-release year out of the cache lookup", async () => {
    await processScreenings("prince-charles", [at("2026-10-30T20:30:00Z", "akira", "Akira (2025 Re-release)")]);

    expect(mocks.lookup.mock.calls[0][2]).toBeUndefined();
    expect(mocks.tmdb).not.toHaveBeenCalled();
  });

  it("keeps the cached film when TMDB finds nothing the year vouches for", async () => {
    await processScreenings("riverside-studios", [at("2026-10-30T20:30:00Z", "hammer", "Dracula", 1958)]);

    expect(mocks.tmdb).toHaveBeenCalledTimes(1);
    expect(mocks.tmdb.mock.calls[0][2]).toBe(1958);
    expect(mocks.tmdb.mock.calls[0][8]).toBe(true);
    expect(mocks.inserted).toHaveBeenCalledWith(expect.objectContaining({ filmId: "cached" }));
  });

  it("uses TMDB's film when it agrees with the year", async () => {
    mocks.tmdb.mockResolvedValue("hammer-1958");
    await processScreenings("riverside-studios", [at("2026-10-30T20:30:00Z", "hammer", "Dracula", 1958)]);

    expect(mocks.inserted).toHaveBeenCalledWith(expect.objectContaining({ filmId: "hammer-1958" }));
  });

  it("falls back to the cached film when TMDB hangs past its 8s ceiling", async () => {
    mocks.tmdb.mockReturnValue(new Promise(() => {}));
    const run = processScreenings("riverside-studios", [at("2026-10-30T20:30:00Z", "hammer", "Dracula", 1958)]);
    await vi.advanceTimersByTimeAsync(8_001);
    await run;

    expect(mocks.inserted).toHaveBeenCalledWith(expect.objectContaining({ filmId: "cached" }));
  });
});
