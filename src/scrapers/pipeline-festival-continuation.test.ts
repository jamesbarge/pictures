/**
 * Integration-seam test: drives the REAL `processScreenings` film loop.
 *
 * Why this file exists separately from the accounting unit tests: proving that
 * `linkFestivalBestEffort` resolves instead of throwing does not prove the film
 * loop continues. The continuation happens two frames up, through
 * `attemptScreeningWrite` (which rethrows anything not connection-shaped) and
 * past the film-level catch (which charges `filmScreenings.length - settled` to
 * `write.failed`). Only running the loop shows it.
 *
 * The discriminator is deliberately sharp: two screenings of ONE film, the
 * first one's festival link failing. Under the pre-patch behaviour the throw
 * reached the film-level catch and the second screening was never inserted at
 * all. So `screeningInserts.length` is 1 before and 2 after, and no assertion
 * here restates a value the test wrote.
 *
 * Only the leaf edges are mocked — the DB, the title extractor, the film cache,
 * the validator, the diff and the progress stamper. The film loop, the write
 * accounting, `attemptScreeningWrite`, `linkFestivalBestEffort` and
 * `linkScreeningToFestival` are all the production code.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawScreening } from "./types";

// --- leaf-edge mocks -------------------------------------------------------

/** Screening rows handed to `db.insert(screenings).values(...)`. */
const screeningInserts: Record<string, unknown>[] = [];
/** Festival-lookup attempts, so we can fail exactly the first one. */
let festivalLookups = 0;
/** Set true to make the first festival lookup reject. */
let failFirstFestivalLookup = true;

const fakeDb = {
  insert: (table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      // Only the screenings table is asserted on; festivalScreenings inserts
      // also land here and are ignored.
      if ((table as { __name?: string })?.__name === "screenings") {
        screeningInserts.push(values);
      }
      return {
        onConflictDoUpdate: async () => undefined,
        onConflictDoNothing: async () => undefined,
      };
    },
  }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
  // Used only by linkScreeningToFestival in this path.
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => {
          festivalLookups++;
          if (failFirstFestivalLookup && festivalLookups === 1) {
            throw new Error("festival lookup timed out");
          }
          return [];
        },
      }),
    }),
  }),
};

vi.mock("@/db", () => ({
  get db() {
    return fakeDb;
  },
  // Pass-through: the timeout race is not what this test is about.
  withDbTimeout: <T>(promise: Promise<T>) => promise,
}));

vi.mock("@/db/schema", () => ({
  screenings: { __name: "screenings", id: {}, filmId: {}, cinemaId: {}, datetime: {} },
  cinemas: { __name: "cinemas", id: {} },
  festivals: { __name: "festivals", id: {}, slug: {} },
  festivalScreenings: { __name: "festivalScreenings" },
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: () => ({}),
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

vi.mock("@/lib/title-extraction", () => ({
  // One film: both screenings must group under the same canonical title.
  extractFilmTitleCached: async () => ({
    filmTitle: "Test Film",
    canonicalTitle: "Test Film",
    confidence: "high",
  }),
  batchExtractTitles: async (titles: string[]) =>
    new Map(
      titles.map((t) => [
        t,
        { filmTitle: "Test Film", canonicalTitle: "Test Film", confidence: "high" },
      ]),
    ),
}));

vi.mock("./utils/film-matching", () => ({
  initFilmCache: async () => ({}),
  // Resolves immediately, so getOrCreateFilm returns without a TMDB call.
  lookupFilmInCache: () => ({ id: "film-1", posterUrl: "https://example.invalid/p.jpg" }),
  logCacheStats: () => {},
  findFilmBySimilarity: async () => null,
  matchAndCreateFromTMDB: async () => null,
  createFilmWithoutTMDB: async () => null,
  tryUpdatePoster: async () => {},
}));

vi.mock("./utils/screening-classification", () => ({
  classifyScreening: async () => ({
    format: "standard",
    isSpecialEvent: false,
    eventType: null,
    eventDescription: null,
    is3D: false,
    hasSubtitles: false,
    subtitleLanguage: null,
    hasAudioDescription: false,
    isRelaxedScreening: false,
    season: null,
  }),
  // No duplicate: both screenings take the insert-on-conflict path.
  checkForDuplicate: async () => ({ duplicate: null, shouldSkip: false }),
}));

vi.mock("./utils/screening-validator", () => ({
  validateScreenings: (raw: RawScreening[]) => ({
    validScreenings: raw,
    rejectedScreenings: [],
    summary: { errorsByType: {} },
  }),
  printValidationSummary: () => {},
}));

vi.mock("./utils/scrape-diff", () => ({
  generateScrapeDiff: async () => ({ hasIssues: false, warnings: [] }),
  printDiffReport: () => {},
  shouldBlockScrape: () => false,
}));

vi.mock("./seasons/season-linker", () => ({
  linkFilmToMatchingSeasons: async () => 0,
}));

vi.mock("@/lib/scrape-progress", () => ({
  runPhase: async <T>(_cinemaId: string, _phase: string, fn: () => Promise<T>) => fn(),
  stampProgress: async () => {},
}));

vi.mock("@/config/cinema-registry", () => ({
  resolveCinemaId: (id: string) => id,
  VENUE_LANGUAGE_PRIORS: {},
}));

import { processScreenings } from "./pipeline";
import { buildAccounting } from "./utils/screening-accounting-report";
import { checkAccounting } from "./utils/screening-accounting";

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

function screening(overrides: Partial<RawScreening> = {}): RawScreening {
  return {
    filmTitle: "Test Film",
    datetime: FUTURE,
    bookingUrl: "https://example.invalid/book",
    ...overrides,
  } as RawScreening;
}

describe("processScreenings continues a film's batch past a festival-link failure", () => {
  beforeEach(() => {
    screeningInserts.length = 0;
    festivalLookups = 0;
    failFirstFestivalLookup = true;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("writes the second screening of the film whose first link failed", async () => {
    const first = screening({
      sourceId: "s1",
      festivalSlug: "lff-2026",
      datetime: new Date(FUTURE.getTime()),
    });
    const second = screening({
      sourceId: "s2",
      festivalSlug: "lff-2026",
      datetime: new Date(FUTURE.getTime() + 3 * 60 * 60 * 1000),
    });

    const result = await processScreenings("fixture-venue", [first, second]);

    // THE discriminator. Pre-patch, the first link's throw reached the
    // film-level catch and this was 1: the second screening was abandoned
    // untried, then counted as a failed write.
    expect(screeningInserts).toHaveLength(2);
    expect(screeningInserts.map((v) => v.sourceId)).toEqual(["s1", "s2"]);

    // Both candidates reached the write loop and both got a write outcome.
    expect(result.accepted).toBe(2);
    expect(result.write).toEqual({ upserted: 2, updated: 0, unchanged: 0, failed: 0 });

    // The link failure is reported, and NOT as a lost write.
    expect(result.postWriteFailures).toBe(1);
    expect(result.failed).toBe(0);

    // Legacy aliases follow the buckets.
    expect(result.added).toBe(2);
    expect(result.updated).toBe(0);

    // And the whole record reconciles through the real conservation checker.
    const accounting = buildAccounting({
      cinemaId: "fixture-venue",
      preFilter: { parsed: 2, accepted: 2, rejected: 0, byReason: {} },
      fetchedPayloads: 1,
      pipeline: result,
    });
    expect(checkAccounting(accounting)).toEqual([]);
  });

  it("reports zero post-write failures when the festival lookup returns no match", async () => {
    // Honest about its own evidence: the lookup resolves to [], so
    // linkScreeningToFestival finds no festival and returns without linking.
    // That is the no-error control for the failure case above; it does NOT
    // exercise the festivalScreenings association, which would need the full
    // festival integration this test deliberately stays out of.
    failFirstFestivalLookup = false;

    const result = await processScreenings("fixture-venue", [
      screening({ sourceId: "s1", festivalSlug: "lff-2026" }),
      screening({
        sourceId: "s2",
        festivalSlug: "lff-2026",
        datetime: new Date(FUTURE.getTime() + 3 * 60 * 60 * 1000),
      }),
    ]);

    expect(screeningInserts).toHaveLength(2);
    expect(result.accepted).toBe(2);
    expect(result.write).toEqual({ upserted: 2, updated: 0, unchanged: 0, failed: 0 });
    expect(result.postWriteFailures).toBe(0);
  });

  it("skips the superseded report and says why when a follow-up failed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await processScreenings("fixture-venue", [
      screening({ sourceId: "s1", festivalSlug: "lff-2026" }),
      screening({
        sourceId: "s2",
        festivalSlug: "lff-2026",
        datetime: new Date(FUTURE.getTime() + 3 * 60 * 60 * 1000),
      }),
    ]);

    // A silent skip would make a lingering orphan indistinguishable from a
    // scraper emitting a duplicate. Zero failed writes used to take that path.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("persisted but their follow-up work failed"),
    );
  });
});
