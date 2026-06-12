import { describe, expect, it } from "vitest";

import {
  DELETE_BATCH_SIZE,
  DELETION_CAP,
  MAX_SCRAPE_AGE_MS,
  batchIds,
  exceedsDeletionCap,
  isPhantomRow,
  isReconcileSafe,
  isVacuousRun,
  parseReconcileArgs,
  scrapeHorizon,
  validateCinemaId,
} from "./reconcile-phantom-screenings";

const NOW = new Date("2026-06-12T12:00:00.000Z");
const minutes = (n: number) => n * 60_000;

describe("parseReconcileArgs (guard 1a: single cinema per invocation)", () => {
  it("parses a bare cinemaId as a dry run", () => {
    const args = parseReconcileArgs(["phoenix-east-finchley"]);
    expect(args).toEqual({
      cinemaId: "phoenix-east-finchley",
      execute: false,
      forceLarge: false,
      errors: [],
    });
  });

  it("parses --execute and --force-large in any order", () => {
    const args = parseReconcileArgs(["--execute", "phoenix-east-finchley", "--force-large"]);
    expect(args.cinemaId).toBe("phoenix-east-finchley");
    expect(args.execute).toBe(true);
    expect(args.forceLarge).toBe(true);
    expect(args.errors).toEqual([]);
  });

  it("errors when the cinemaId is missing", () => {
    const args = parseReconcileArgs(["--execute"]);
    expect(args.cinemaId).toBeNull();
    expect(args.errors).toHaveLength(1);
    expect(args.errors[0]).toMatch(/missing/i);
  });

  it("errors on a second positional cinemaId", () => {
    const args = parseReconcileArgs(["rio-dalston", "ica"]);
    expect(args.errors).toHaveLength(1);
    expect(args.errors[0]).toMatch(/one cinema per invocation/i);
  });

  it("errors on unknown flags instead of ignoring them", () => {
    const args = parseReconcileArgs(["rio-dalston", "--exectue"]);
    expect(args.errors).toHaveLength(1);
    expect(args.errors[0]).toMatch(/unknown flag/i);
  });
});

describe("validateCinemaId (guard 1b: must exist in registry)", () => {
  const known = ["phoenix-east-finchley", "rio-dalston", "bfi-southbank"];

  it("accepts a known id", () => {
    expect(validateCinemaId("rio-dalston", known)).toBe(true);
  });

  it("rejects an unknown id", () => {
    expect(validateCinemaId("rio-dalson", known)).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(validateCinemaId("", known)).toBe(false);
  });
});

describe("isReconcileSafe (guard 2: fresh successful scrape required)", () => {
  it("accepts a scrape completed just now", () => {
    expect(isReconcileSafe(NOW, NOW)).toBe(true);
  });

  it("accepts a scrape completed 1h59m ago", () => {
    expect(isReconcileSafe(new Date(NOW.getTime() - minutes(119)), NOW)).toBe(true);
  });

  it("accepts a scrape completed exactly at the 2h boundary", () => {
    expect(isReconcileSafe(new Date(NOW.getTime() - MAX_SCRAPE_AGE_MS), NOW)).toBe(true);
  });

  it("rejects a scrape completed 2h01m ago", () => {
    expect(isReconcileSafe(new Date(NOW.getTime() - minutes(121)), NOW)).toBe(false);
  });

  it("rejects a missing completion time (run never finished)", () => {
    expect(isReconcileSafe(null, NOW)).toBe(false);
    expect(isReconcileSafe(undefined, NOW)).toBe(false);
  });

  it("rejects a completion time in the future (clock skew / bad data)", () => {
    expect(isReconcileSafe(new Date(NOW.getTime() + minutes(5)), NOW)).toBe(false);
  });

  it("pins the documented 2h window", () => {
    expect(MAX_SCRAPE_AGE_MS).toBe(2 * 60 * 60 * 1000);
  });
});

describe("isVacuousRun (guard 2b: empty 'success' scrapes are never swept behind)", () => {
  it("flags a zero-screening run", () => {
    expect(isVacuousRun(0)).toBe(true);
  });

  it("flags a run with no recorded count", () => {
    expect(isVacuousRun(null)).toBe(true);
    expect(isVacuousRun(undefined)).toBe(true);
  });

  it("accepts a run that upserted screenings", () => {
    expect(isVacuousRun(1)).toBe(false);
    expect(isVacuousRun(70)).toBe(false);
  });
});

describe("isPhantomRow (guard 3: future-only AND untouched by the last run)", () => {
  const runStartedAt = new Date(NOW.getTime() - minutes(30));
  const future = new Date(NOW.getTime() + minutes(60));
  const past = new Date(NOW.getTime() - minutes(60));
  const staleScrape = new Date(NOW.getTime() - minutes(90)); // before run start
  const freshScrape = new Date(NOW.getTime() - minutes(10)); // during the run

  it("flags a future row the run did not refresh", () => {
    expect(isPhantomRow({ datetime: future, scrapedAt: staleScrape }, runStartedAt, NOW)).toBe(true);
  });

  it("never flags a row the run refreshed", () => {
    expect(isPhantomRow({ datetime: future, scrapedAt: freshScrape }, runStartedAt, NOW)).toBe(false);
  });

  it("never flags a past row, even if stale (db:cleanup-screenings territory)", () => {
    expect(isPhantomRow({ datetime: past, scrapedAt: staleScrape }, runStartedAt, NOW)).toBe(false);
  });

  it("never flags a row scraped exactly at run start", () => {
    expect(isPhantomRow({ datetime: future, scrapedAt: runStartedAt }, runStartedAt, NOW)).toBe(false);
  });

  it("treats a row at exactly now as upcoming (matches the >= now SQL filter)", () => {
    expect(isPhantomRow({ datetime: NOW, scrapedAt: staleScrape }, runStartedAt, NOW)).toBe(true);
  });
});

describe("scrapeHorizon (guard 3b: never condemn rows beyond demonstrated coverage)", () => {
  const runStartedAt = new Date(NOW.getTime() - minutes(30));
  const fresh = new Date(NOW.getTime() - minutes(10)); // refreshed by the run
  const stale = new Date(NOW.getTime() - minutes(90)); // not refreshed

  it("returns the latest datetime among refreshed rows only", () => {
    const day = (n: number) => new Date(NOW.getTime() + n * 24 * minutes(60));
    const rows = [
      { datetime: day(1), scrapedAt: fresh },
      { datetime: day(7), scrapedAt: fresh },
      { datetime: day(60), scrapedAt: stale }, // far-future stale row must NOT extend the horizon
    ];
    expect(scrapeHorizon(rows, runStartedAt)).toEqual(day(7));
  });

  it("counts a row scraped exactly at run start as refreshed", () => {
    const rows = [{ datetime: new Date(NOW.getTime() + minutes(60)), scrapedAt: runStartedAt }];
    expect(scrapeHorizon(rows, runStartedAt)).toEqual(rows[0].datetime);
  });

  it("returns null when the run refreshed nothing", () => {
    const rows = [{ datetime: new Date(NOW.getTime() + minutes(60)), scrapedAt: stale }];
    expect(scrapeHorizon(rows, runStartedAt)).toBeNull();
    expect(scrapeHorizon([], runStartedAt)).toBeNull();
  });
});

describe("exceedsDeletionCap (guard 4: 40% cap)", () => {
  it("allows zero deletions", () => {
    expect(exceedsDeletionCap(0, 100)).toBe(false);
    expect(exceedsDeletionCap(0, 0)).toBe(false);
  });

  it("allows deletions at or under the cap", () => {
    expect(exceedsDeletionCap(40, 100)).toBe(false);
    expect(exceedsDeletionCap(1, 100)).toBe(false);
  });

  it("refuses deletions over the cap", () => {
    expect(exceedsDeletionCap(41, 100)).toBe(true);
    expect(exceedsDeletionCap(63, 63)).toBe(true); // the 100% LARGE_DROP case
  });

  it("refuses any deletion when the upcoming total is zero (inconsistent plan)", () => {
    expect(exceedsDeletionCap(5, 0)).toBe(true);
  });

  it("uses the documented default cap", () => {
    expect(DELETION_CAP).toBe(0.4);
  });
});

describe("batchIds (guard 5: bounded delete batches)", () => {
  it("splits ids into batches of the default size", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const batches = batchIds(ids);
    expect(batches.map((b) => b.length)).toEqual([DELETE_BATCH_SIZE, DELETE_BATCH_SIZE, 50]);
    expect(batches.flat()).toEqual(ids); // no row lost or duplicated
  });

  it("returns a single batch when under the size", () => {
    expect(batchIds(["a", "b"])).toEqual([["a", "b"]]);
  });

  it("returns no batches for an empty plan", () => {
    expect(batchIds([])).toEqual([]);
  });

  it("rejects a non-positive batch size", () => {
    expect(() => batchIds(["a"], 0)).toThrow(/size must be > 0/);
  });

  it("pins the documented batch size", () => {
    expect(DELETE_BATCH_SIZE).toBe(100);
  });
});
