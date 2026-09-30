/**
 * Seam tests: drive the real BaseScraper template method, the real festival
 * best-effort helper and the real accounting assembly, with only the network
 * and DB edges mocked.
 *
 * Deliberately not self-fulfilling: the expected counts are derived from the
 * shape of the fixture input, and every assertion goes through the production
 * `validate()`, `linkFestivalBestEffort()` and `buildAccounting()` rather than
 * a hand-built array.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { checkAccounting, UNAVAILABLE } from "./screening-accounting";
import { asPreFilterSource, buildAccounting } from "./screening-accounting-report";
import { linkFestivalBestEffort, type PipelineResult } from "../pipeline";

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

function candidate(overrides: Partial<RawScreening> = {}): RawScreening {
  return {
    filmTitle: "Test Film",
    datetime: FUTURE,
    bookingUrl: "https://example.invalid/book",
    ...overrides,
  } as RawScreening;
}

/** Minimal real subclass: only the two abstract members are supplied. */
class FixtureScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "fixture-venue",
    baseUrl: "https://example.invalid",
    delayBetweenRequests: 0,
  } as ScraperConfig;

  /**
   * Mutable so a SECOND scrape on the SAME instance can fail. A fresh instance
   * starts with null counters either way, so only reusing the instance can
   * detect a missing reset.
   */
  fetchError?: Error;

  constructor(
    private readonly pages: string[],
    private readonly candidates: RawScreening[],
  ) {
    super();
  }

  protected async fetchPages(): Promise<string[]> {
    if (this.fetchError) throw this.fetchError;
    return this.pages;
  }

  protected async parsePages(): Promise<RawScreening[]> {
    return this.candidates;
  }

  // Keep the overlay lookup off the DB in tests.
  protected async loadConfigOverlay(): Promise<void> {}
}

/**
 * Mirrors the shape of the three live overrides (`nickel-v2`, `genesis-v2`,
 * `lexi-v2`): call super.validate(), then filter the result again. Nickel's
 * real override drops `MYSTERY MOVIE`, which is what this reproduces.
 */
class SubclassFilterScraper extends FixtureScraper {
  protected validate(screenings: RawScreening[]): RawScreening[] {
    return super.validate(screenings).filter((s) => s.filmTitle !== "MYSTERY MOVIE");
  }
}

/** Pathological: returns more than the base filter kept. */
class InflatingScraper extends FixtureScraper {
  protected validate(screenings: RawScreening[]): RawScreening[] {
    const kept = super.validate(screenings);
    return [...kept, candidate({ sourceId: "conjured" })];
  }
}

/** A scraper that satisfies CinemaScraper without extending BaseScraper. */
class BareScraper {
  config = { cinemaId: "bare-venue" } as ScraperConfig;
  async scrape(): Promise<RawScreening[]> {
    return [candidate()];
  }
  async healthCheck(): Promise<boolean> {
    return true;
  }
}

function pipelineResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    cinemaId: "fixture-venue",
    added: 0,
    updated: 0,
    failed: 0,
    rejected: 0,
    rejectedByReason: {},
    accepted: 0,
    write: { upserted: 0, updated: 0, unchanged: 0, failed: 0 },
    postWriteFailures: 0,
    blocked: false,
    scrapedAt: new Date(),
    ...overrides,
  };
}

describe("BaseScraper pre-filter accounting", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("reports nothing before a scrape has run", () => {
    const scraper = new FixtureScraper([], []);
    expect(scraper.getPreFilterReport()).toBeNull();
    expect(scraper.getFetchedPayloadCount()).toBeNull();
  });

  it("attributes each pre-filter rejection to exactly one reason", async () => {
    const input = [
      candidate(),                                        // kept
      candidate({ filmTitle: "   " }),                    // missing_title
      candidate({ datetime: new Date("nope") }),          // invalid_datetime
      candidate({ datetime: PAST }),                      // past_screening
      candidate({ bookingUrl: "" }),                      // missing_booking_url
      candidate({ sourceId: "dup" }),                     // kept
      candidate({ sourceId: "dup" }),                     // duplicate_source_id
    ];
    const scraper = new FixtureScraper(["<html/>", "<html/>"], input);

    const kept = await scraper.scrape();
    const report = scraper.getPreFilterReport();

    expect(report).not.toBeNull();
    // Conservation at the pre-filter boundary, from the real filter.
    expect(report!.parsed).toBe(input.length);
    expect(report!.accepted).toBe(kept.length);
    expect(report!.rejected).toBe(input.length - kept.length);
    expect(Object.values(report!.byReason).reduce((a, b) => a + b, 0)).toBe(report!.rejected);
    expect(report!.byReason).toEqual({
      missing_title: 1,
      invalid_datetime: 1,
      past_screening: 1,
      missing_booking_url: 1,
      duplicate_source_id: 1,
    });
    // Two entries came back from fetchPages, which is a payload count and not
    // a request count — a subclass may make several calls per entry.
    expect(scraper.getFetchedPayloadCount()).toBe(2);
  });

  it("keeps the surviving set identical to the pre-change filter", async () => {
    const keepA = candidate({ sourceId: "a" });
    const keepB = candidate({ sourceId: "b" });
    const scraper = new FixtureScraper(["<html/>"], [keepA, candidate({ datetime: PAST }), keepB]);
    await expect(scraper.scrape()).resolves.toEqual([keepA, keepB]);
  });

  it("clears a previous report so a failed scrape cannot inherit stale counts", async () => {
    // One instance throughout. A new instance would start null regardless, so
    // it could never detect a missing reset — the stale counts this guards
    // against belong to the SAME scraper's previous run.
    const scraper = new FixtureScraper(["<html/>"], [candidate({ datetime: PAST })]);

    await scraper.scrape();
    expect(scraper.getPreFilterReport()!.rejected).toBe(1);
    expect(scraper.getFetchedPayloadCount()).toBe(1);

    // The second scrape fails in fetchPages, before parse and validate. Without
    // the reset at the top of scrape() both getters would still be serving the
    // first run's numbers, attributed to a run that produced none.
    scraper.fetchError = new Error("boom");
    await expect(scraper.scrape()).rejects.toThrow("boom");
    expect(scraper.getPreFilterReport()).toBeNull();
    expect(scraper.getFetchedPayloadCount()).toBeNull();
  });
});

describe("a subclass filter after super.validate() cannot falsify the counts", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("attributes the subclass's own drops instead of overstating accepted", async () => {
    // One mystery screening, otherwise valid. The base filter keeps it; the
    // override drops it. Before the reconciliation this reported
    // parsed=1/accepted=1/rejected=0 while scrape() returned nothing, so
    // buildAccounting produced a conservation failure that was an accounting
    // artefact rather than a real loss.
    const scraper = new SubclassFilterScraper(["<html/>"], [
      candidate({ filmTitle: "MYSTERY MOVIE", sourceId: "m1" }),
      candidate({ sourceId: "ok1" }),
    ]);

    const kept = await scraper.scrape();
    const report = scraper.getPreFilterReport()!;

    // The surviving set is untouched: the fix moves counts, not behaviour.
    expect(kept.map((s) => s.sourceId)).toEqual(["ok1"]);

    expect(report.parsed).toBe(2);
    expect(report.accepted).toBe(kept.length);
    expect(report.rejected).toBe(report.parsed - kept.length);
    expect(report.byReason.subclass_filter).toBe(1);
    expect(Object.values(report.byReason).reduce((a, b) => a + b, 0)).toBe(report.rejected);

    // And the assembled record reconciles, with the pipeline accepting exactly
    // what scrape() returned.
    const accounting = buildAccounting({
      cinemaId: "fixture-venue",
      preFilter: report,
      fetchedPayloads: scraper.getFetchedPayloadCount(),
      pipeline: pipelineResult({
        accepted: kept.length,
        write: { upserted: kept.length, updated: 0, unchanged: 0, failed: 0 },
      }),
    });
    expect(checkAccounting(accounting)).toEqual([]);
  });

  it("keeps a pure-dedup override, which drops nothing, free of a subclass reason", async () => {
    // genesis-v2 and lexi-v2 repeat the base sourceId dedup, so their override
    // is a no-op and must not invent a subclass_filter entry.
    const scraper = new SubclassFilterScraper(["<html/>"], [candidate({ sourceId: "ok1" })]);
    await scraper.scrape();
    expect(scraper.getPreFilterReport()!.byReason.subclass_filter).toBeUndefined();
    expect(scraper.getPreFilterReport()!.rejected).toBe(0);
  });

  it("reports unavailable when an override returns more than the filter kept", async () => {
    // Nothing does this today. The report cannot describe such a set, so it
    // must go unavailable rather than carry a negative or a wrong number.
    const scraper = new InflatingScraper(["<html/>"], [candidate({ sourceId: "ok1" })]);
    const kept = await scraper.scrape();
    expect(kept).toHaveLength(2);
    expect(scraper.getPreFilterReport()).toBeNull();
  });
});

describe("festival linking is best-effort and continues the batch", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("reports a link failure without throwing, so the caller keeps writing", async () => {
    // This is the deliberate behaviour change. Before the accounting patch the
    // throw escaped insertScreening, attemptScreeningWrite rethrew it (not
    // connection-shaped) and the film-level catch counted the film's whole
    // remaining batch as failed. The helper must now resolve.
    const seen: unknown[] = [];
    const outcome = await linkFestivalBestEffort(
      "film-1",
      "fixture-venue",
      candidate({ festivalSlug: "lff", sourceId: "s1" }),
      (error) => seen.push(error),
      async () => {
        throw new Error("festival lookup timed out");
      },
    );

    expect(outcome).toBe("failed");
    expect(seen).toHaveLength(1);
    expect((seen[0] as Error).message).toBe("festival lookup timed out");
  });

  it("links a festival screening and reports no post-write failure", async () => {
    const seen: unknown[] = [];
    const linked: string[] = [];
    const outcome = await linkFestivalBestEffort(
      "film-1",
      "fixture-venue",
      candidate({ festivalSlug: "lff" }),
      (error) => seen.push(error),
      async (filmId) => {
        linked.push(filmId);
      },
    );

    expect(outcome).toBe("linked");
    expect(linked).toEqual(["film-1"]);
    expect(seen).toEqual([]);
  });

  it("does not touch the link path for a non-festival screening", async () => {
    let called = 0;
    const outcome = await linkFestivalBestEffort(
      "film-1",
      "fixture-venue",
      candidate(),
      undefined,
      async () => {
        called++;
      },
    );

    expect(outcome).toBe("not_applicable");
    expect(called).toBe(0);
  });

  it("keeps a post-write failure out of the failed-write column", () => {
    // Four candidates accepted, four write statements completed, one of them
    // with a failed follow-up. Loss is zero and the failure is still visible.
    const accounting = buildAccounting({
      cinemaId: "fixture-venue",
      preFilter: null,
      fetchedPayloads: null,
      pipeline: pipelineResult({
        accepted: 4,
        write: { upserted: 4, updated: 0, unchanged: 0, failed: 0 },
        postWriteFailures: 1,
      }),
    });

    expect(accounting.write.failed).toBe(0);
    expect(accounting.postWriteFailures).toBe(1);
    expect(checkAccounting(accounting)).toEqual([]);
  });
});

describe("accounting assembly across the runner seam", () => {
  it("reconciles a venue with pre-filter, validation and mixed write outcomes", () => {
    // 10 parsed, 2 pre-filtered, 1 validation-rejected leaves 7 accepted,
    // which must equal the four write buckets.
    const accounting = buildAccounting({
      cinemaId: "fixture-venue",
      preFilter: { parsed: 10, accepted: 8, rejected: 2, byReason: { past_screening: 2 } },
      fetchedPayloads: 3,
      pipeline: pipelineResult({
        rejected: 1,
        rejectedByReason: { suspicious_time_early: 1 },
        accepted: 7,
        write: { upserted: 3, updated: 2, unchanged: 1, failed: 1 },
      }),
    });

    expect(accounting.accepted).toBe(7);
    expect(accounting.fetchedPayloads).toBe(3);
    expect(accounting.insertUpdateAttribution).toBe(UNAVAILABLE);
    expect(accounting.affectedRowAttribution).toBe(UNAVAILABLE);
    expect(checkAccounting(accounting)).toEqual([]);
  });

  it("detects a candidate that reached no write outcome at all", () => {
    // Fault injection for the equation itself. `accepted` comes from the
    // pipeline's own measurement of its write-loop input, so a candidate the
    // write loop dropped without counting — a missed branch, an early
    // continue — leaves the buckets one short and MUST be reported.
    //
    // This is the test that would have failed silently while buildAccounting
    // derived `accepted` by summing the same buckets it was checked against.
    const accounting = buildAccounting({
      cinemaId: "fixture-venue",
      preFilter: { parsed: 10, accepted: 8, rejected: 2, byReason: { past_screening: 2 } },
      fetchedPayloads: 3,
      pipeline: pipelineResult({
        rejected: 1,
        rejectedByReason: { suspicious_time_early: 1 },
        accepted: 7,
        // Sums to 6, one short of the 7 the write loop received.
        write: { upserted: 3, updated: 2, unchanged: 1, failed: 0 },
      }),
    });

    expect(accounting.accepted).toBe(7);
    const problems = checkAccounting(accounting);
    expect(problems.map((p) => p.boundary)).toContain("write");
    expect(problems.find((p) => p.boundary === "write")!.message).toContain(
      "accepted 7 does not equal write outcomes 6",
    );
  });

  it("does not paper over a surplus write outcome either", () => {
    const accounting = buildAccounting({
      cinemaId: "fixture-venue",
      preFilter: null,
      fetchedPayloads: null,
      pipeline: pipelineResult({
        accepted: 2,
        // Double-counted: three outcomes for two accepted candidates.
        write: { upserted: 2, updated: 0, unchanged: 0, failed: 1 },
      }),
    });

    expect(checkAccounting(accounting).map((p) => p.boundary)).toContain("write");
  });

  it("marks pre-filter unavailable for a scraper that does not extend BaseScraper", () => {
    const bare = new BareScraper();
    expect(asPreFilterSource(bare)).toBeNull();

    const accounting = buildAccounting({
      cinemaId: "bare-venue",
      preFilter: null,
      fetchedPayloads: null,
      pipeline: pipelineResult({
        accepted: 1,
        write: { upserted: 1, updated: 0, unchanged: 0, failed: 0 },
      }),
    });

    expect(accounting.parsed).toBe(UNAVAILABLE);
    expect(accounting.preFiltered).toBe(UNAVAILABLE);
    expect(accounting.fetchedPayloads).toBe(UNAVAILABLE);
    expect(accounting.accepted).toBe(1);
    expect(checkAccounting(accounting)).toEqual([]);
  });

  it("recognises a BaseScraper subclass as a pre-filter source", () => {
    expect(asPreFilterSource(new FixtureScraper([], []))).not.toBeNull();
  });

  it("reports a blocked venue as accepting nothing and writing nothing", () => {
    const accounting = buildAccounting({
      cinemaId: "fixture-venue",
      preFilter: { parsed: 5, accepted: 5, rejected: 0, byReason: {} },
      fetchedPayloads: 1,
      // The pipeline's blocked early return carries the whole batch in the
      // legacy `failed` alias and leaves the precise counters at zero.
      pipeline: pipelineResult({ blocked: true, failed: 5, accepted: 0 }),
    });

    expect(accounting.blocked).toBe(true);
    expect(accounting.accepted).toBe(0);
    expect(accounting.write).toEqual({ upserted: 0, updated: 0, unchanged: 0, failed: 0 });
    expect(checkAccounting(accounting)).toEqual([]);
  });

  it("flags a supplementary batch so its counts are never added to a full run", () => {
    const accounting = buildAccounting({
      cinemaId: "the-arzner",
      preFilter: null,
      fetchedPayloads: null,
      pipeline: pipelineResult({
        accepted: 9,
        write: { upserted: 9, updated: 0, unchanged: 0, failed: 0 },
      }),
      supplementary: true,
    });
    expect(accounting.supplementary).toBe(true);
    expect(checkAccounting(accounting)).toEqual([]);
  });

  it("reports no pipeline run as zero accepted rather than a fabricated write set", () => {
    const accounting = buildAccounting({
      cinemaId: "fixture-venue",
      preFilter: { parsed: 0, accepted: 0, rejected: 0, byReason: {} },
      fetchedPayloads: 1,
      pipeline: null,
    });
    expect(accounting.accepted).toBe(0);
    expect(accounting.write).toEqual({ upserted: 0, updated: 0, unchanged: 0, failed: 0 });
    expect(checkAccounting(accounting)).toEqual([]);
  });
});
