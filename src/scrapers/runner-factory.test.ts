/**
 * Tests for runner-factory: connection-error classification and the
 * per-venue wall-clock cap (plan 001 — scrape circuit breaker).
 */
import { describe, it, expect, vi, afterEach } from "vitest";

// Keep the runner away from any real database: recordScraperRun/getBaseline
// short-circuit when isDatabaseAvailable is false.
vi.mock("../db", () => ({
  db: {},
  isDatabaseAvailable: false,
}));

// The pipeline is exercised by its own tests; here we only need
// deterministic stubs so runScraper can complete without a DB.
vi.mock("./pipeline", () => ({
  processScreenings: vi.fn(async (cinemaId: string, screenings: unknown[]) => ({
    cinemaId,
    added: screenings.length,
    updated: 0,
    failed: 0,
    rejected: 0,
    blocked: false,
    scrapedAt: new Date(),
  })),
  saveScreenings: vi.fn(async () => ({ added: 0, blocked: false })),
  ensureCinemaExists: vi.fn(async () => {}),
}));

import {
  isConnectionError,
  runScraper,
  type MultiVenueConfig,
  type SingleVenueConfig,
  type ChainConfig,
} from "./runner-factory";
import type { CinemaScraper, ChainScraper } from "./types";
import { ensureCinemaExists } from "./pipeline";

describe("isConnectionError", () => {
  it("classifies DB connection/pooler failures as connection errors", () => {
    expect(
      isConnectionError(
        new Error("getOrCreateFilm: Some Film timeout after 20000ms (client-side)"),
      ),
    ).toBe(true);
    expect(isConnectionError(new Error("connect ECONNREFUSED 1.2.3.4:5432"))).toBe(true);
    expect(isConnectionError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isConnectionError(new Error("remaining connection slots are reserved"))).toBe(true);
    expect(isConnectionError(new Error("write CONNECT_TIMEOUT 1.2.3.4:6543"))).toBe(true);
    expect(isConnectionError(new Error("Max client connections reached"))).toBe(true);
    expect(
      isConnectionError(new Error("Venue rio-dalston timeout after 600000ms (venue wall-clock cap)")),
    ).toBe(true);
    expect(isConnectionError(new Error("canceling statement due to user request (57014)"))).toBe(
      true,
    );
    expect(
      isConnectionError(new Error("terminating connection due to administrator command")),
    ).toBe(true);
  });

  it("does not classify ordinary scrape/site errors as connection errors", () => {
    expect(isConnectionError(new Error("Found 0 screenings"))).toBe(false);
    expect(isConnectionError(new Error("Health check failed - site not accessible"))).toBe(false);
    expect(isConnectionError(new Error("scrape_blocked_by_diff_check"))).toBe(false);
    expect(isConnectionError(new Error("Cloudflare challenge page detected"))).toBe(false);
    // A Playwright nav timeout is the venue's WEBSITE being slow, not the DB —
    // it must not count toward a breaker that aborts the whole run.
    expect(isConnectionError(new Error("page.goto: Timeout 30000ms exceeded"))).toBe(false);
    // A venue site refusing connections is not the DB (no Postgres port).
    expect(isConnectionError(new Error("connect ECONNREFUSED 93.184.216.34:443"))).toBe(false);
  });

  it("handles non-Error values", () => {
    // Ambiguous-origin socket timeouts no longer count (could be a venue
    // site); the breaker's progress-based success guard compensates.
    expect(isConnectionError("ETIMEDOUT: socket timeout")).toBe(false);
    expect(isConnectionError("no showtimes found")).toBe(false);
    expect(isConnectionError(undefined)).toBe(false);
  });
});

describe("health-check precheck (advisory, once per venue)", () => {
  /**
   * The precheck is advisory, so it has no reason to run more than once. When
   * it sat inside the retry loop, a host that black-holes packets paid
   * `retryAttempts + 1` prechecks — 4 × ~98s, since BaseScraper.healthCheck
   * retries internally (3 × 30s + 2 × 4s). That ~400s pushed the venue past
   * VENUE_TIMEOUT_MS, so it failed with "(venue wall-clock cap)", which
   * isConnectionError DOES match — and three such venues in a row tripped the
   * run-level breaker and aborted the rest of the run plus enrichment.
   */
  it(
    "probes once even when the venue exhausts all its retries",
    async () => {
      const healthCheck = vi.fn(async () => false);
      const scrape = vi.fn(async (): Promise<never> => {
        throw new Error("page.goto: Timeout 30000ms exceeded");
      });
      const scraper = { healthCheck, scrape } as unknown as CinemaScraper;

      const config: SingleVenueConfig = {
        type: "single",
        venue: { id: "black-hole-venue", name: "Black Hole", shortName: "bh" },
        createScraper: () => scraper,
      };

      const result = await runScraper(config, { useValidation: true, retryAttempts: 3 });

      expect(healthCheck).toHaveBeenCalledTimes(1);
      expect(scrape).toHaveBeenCalledTimes(4);
      expect(result.venueResults[0]).toMatchObject({
        venueId: "black-hole-venue",
        success: false,
        retryCount: 3,
      });
      // The venue reports the scraper's own error, which isConnectionError
      // deliberately does not match, so the breaker counter still resets.
      expect(result.venueResults[0].error).toBe("page.goto: Timeout 30000ms exceeded");
      expect(isConnectionError(new Error(result.venueResults[0].error!))).toBe(false);
    },
    // Real timers: three jittered backoffs (1s/2s/4s × 0.5-1.5) ≈ 10.5s worst case.
    30_000,
  );

  it("scrapes anyway when the precheck fails — the veto stays advisory", async () => {
    const healthCheck = vi.fn(async () => false);
    const scrape = vi.fn(async () => []);
    const scraper = { healthCheck, scrape } as unknown as CinemaScraper;

    const config: SingleVenueConfig = {
      type: "single",
      venue: { id: "waf-403-venue", name: "WAF 403", shortName: "waf" },
      createScraper: () => scraper,
    };

    const result = await runScraper(config, { useValidation: true });

    expect(healthCheck).toHaveBeenCalledTimes(1);
    expect(scrape).toHaveBeenCalledTimes(1);
    expect(result.venueResults[0]).toMatchObject({ venueId: "waf-403-venue", success: true });
  });

  it("a throwing healthCheck() override neither aborts the venue nor re-probes", async () => {
    const healthCheck = vi.fn(async (): Promise<never> => {
      throw new Error("boom in override");
    });
    const scrape = vi.fn(async () => []);
    const scraper = { healthCheck, scrape } as unknown as CinemaScraper;

    const config: SingleVenueConfig = {
      type: "single",
      venue: { id: "throwing-health-venue", name: "Throwing", shortName: "th" },
      createScraper: () => scraper,
    };

    const result = await runScraper(config, { useValidation: true });

    expect(healthCheck).toHaveBeenCalledTimes(1);
    expect(scrape).toHaveBeenCalledTimes(1);
    expect(result.venueResults[0]).toMatchObject({ venueId: "throwing-health-venue", success: true });
  });
});

describe("per-venue wall-clock cap", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts a venue that exceeds the cap and continues to the next venue", async () => {
    vi.useFakeTimers();

    const makeVenue = (id: string) => ({ id, name: id, shortName: id });
    const hangingScraper = {
      healthCheck: vi.fn(async () => true),
      // Wedges forever — simulates the 2026-06-09/11 hangs on an await the
      // per-query withDbTimeout does not cover.
      scrape: vi.fn(() => new Promise<never>(() => {})),
    } as unknown as CinemaScraper;
    const quickScraper = {
      healthCheck: vi.fn(async () => true),
      scrape: vi.fn(async () => []),
    } as unknown as CinemaScraper;

    const config: MultiVenueConfig = {
      type: "multi",
      venues: [makeVenue("wedged-venue"), makeVenue("healthy-venue")],
      createScraper: (venueId: string) =>
        venueId === "wedged-venue" ? hangingScraper : quickScraper,
    };

    const resultPromise = runScraper(config, { useValidation: true });
    // Default cap is 10 minutes — advance past it so the race rejects.
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 1_000);
    const result = await resultPromise;

    expect(result.venueResults).toHaveLength(2);
    expect(result.venueResults[0]).toMatchObject({ venueId: "wedged-venue", success: false });
    expect(result.venueResults[0].error).toMatch(/timeout/i);
    // The wedged venue did not block the rest of the run.
    expect(result.venueResults[1]).toMatchObject({ venueId: "healthy-venue", success: true });
    expect(result.success).toBe(false);
  });
});

/**
 * A run that produced no venue results at all must not report success.
 *
 * `ensureCinemaExists` is called outside the per-venue try in all three
 * branches, so a throw there unwinds to the outer catch, which logs
 * `runner_error` and falls through with `venueResults` still empty.
 * `[].every(...)` is `true`, so the run used to report `success: true`,
 * `totalVenuesFailed: 0`, exit code 0. `scrape-all.ts` then printed `ok`,
 * counted a breaker success, and checkpointed the entry as done for `--resume`,
 * while no `scraper_runs` row existed for any venue.
 *
 * In the chain branch that meant one bad venue silently skipped all ~15 Curzon
 * venues and still reported clean. A total loss reported green is worse than
 * the silent bad write this work set out to remove.
 */
describe("empty run results", () => {
  it("reports failure when ensureCinemaExists throws for a single venue", async () => {
    vi.mocked(ensureCinemaExists).mockRejectedValueOnce(
      new Error('Cinema "made-up" is not in the cinema registry'),
    );

    const scrape = vi.fn(async () => []);
    const config: SingleVenueConfig = {
      type: "single",
      venue: { id: "made-up", name: "Made Up", shortName: "mu" },
      createScraper: () => ({ scrape }) as unknown as CinemaScraper,
    };

    const result = await runScraper(config, { useValidation: true });

    expect(result.success).toBe(false);
    expect(result.totalVenuesFailed).toBe(1);
    expect(result.venueResults[0]).toMatchObject({ venueId: "made-up", success: false });
    expect(result.venueResults[0].error).toMatch(/not in the cinema registry/);
    expect(scrape).not.toHaveBeenCalled();
  });

  it("keeps a chain running when one venue's cinema row cannot be ensured", async () => {
    // The chain branch ensures every venue up front, in a bare loop. One bad
    // venue must cost that venue, not the other fourteen.
    vi.mocked(ensureCinemaExists).mockImplementation(async (cinema) => {
      if (cinema.id === "chain-bad") throw new Error("not in the cinema registry");
    });

    const scrapeVenue = vi.fn(async () => []);
    const config: MultiVenueConfig = {
      type: "multi",
      venues: [
        { id: "chain-good", name: "Good", shortName: "g" },
        { id: "chain-bad", name: "Bad", shortName: "b" },
      ],
      createScraper: () => ({ scrape: scrapeVenue }) as unknown as CinemaScraper,
    };

    const result = await runScraper(config, { useValidation: true, continueOnError: true });

    expect(result.success).toBe(false);
    expect(result.venueResults.map((r) => r.venueId).sort()).toEqual([
      "chain-bad",
      "chain-good",
    ]);
    expect(result.venueResults.find((r) => r.venueId === "chain-bad")!.success).toBe(false);
    expect(result.venueResults.find((r) => r.venueId === "chain-good")!.success).toBe(true);

    vi.mocked(ensureCinemaExists).mockImplementation(async () => {});
  });
});

/**
 * A chain venue whose cinema row could not be ensured must not be handed to
 * the chain scraper.
 *
 * The chain branch filters `venuesToScrape` after initialisation, but the
 * scrape call was still passing the unfiltered `activeVenueIds`. The scraper
 * therefore did work for a venue with no `cinemas` row, and any screenings it
 * returned were discarded by the results loop, which iterates the filtered
 * list. With every venue failing, the scraper was still constructed and
 * invoked with the full list.
 */
describe("chain venue initialisation failures", () => {
  const chainScraperFor = (scrapeVenues: ReturnType<typeof vi.fn>) =>
    ({
      scrapeVenues,
      scrapeAll: vi.fn(),
      scrapeVenue: vi.fn(),
      healthCheck: vi.fn(async () => true),
      venueErrors: new Map<string, string>(),
    }) as unknown as ChainScraper;

  const chainConfig = (createScraper: () => ChainScraper): ChainConfig => ({
    type: "chain",
    chainName: "Testchain",
    venues: [
      { id: "chain-ok", name: "Ok Venue", shortName: "ok" },
      { id: "chain-broken", name: "Broken Venue", shortName: "broken" },
    ],
    createScraper,
    getActiveVenueIds: () => ["chain-ok", "chain-broken"],
  });

  afterEach(() => {
    vi.mocked(ensureCinemaExists).mockImplementation(async () => {});
  });

  it("scrapes only the venues that initialised", async () => {
    vi.mocked(ensureCinemaExists).mockImplementation(async (cinema) => {
      if (cinema.id === "chain-broken") throw new Error("not in the cinema registry");
    });

    const scrapeVenues = vi.fn(async () => new Map([["chain-ok", []]]));
    const result = await runScraper(chainConfig(() => chainScraperFor(scrapeVenues)), {
      useValidation: true,
    });

    expect(scrapeVenues).toHaveBeenCalledTimes(1);
    expect(scrapeVenues).toHaveBeenCalledWith(["chain-ok"]);

    expect(result.success).toBe(false);
    expect(result.venueResults.find((r) => r.venueId === "chain-broken")!.success).toBe(false);
    expect(result.venueResults.find((r) => r.venueId === "chain-ok")!.success).toBe(true);
  });

  it("never builds or calls the scraper when every venue fails to initialise", async () => {
    vi.mocked(ensureCinemaExists).mockImplementation(async () => {
      throw new Error("not in the cinema registry");
    });

    const scrapeVenues = vi.fn(async () => new Map());
    const createScraper = vi.fn(() => chainScraperFor(scrapeVenues));

    const result = await runScraper(chainConfig(createScraper), { useValidation: true });

    expect(createScraper).not.toHaveBeenCalled();
    expect(scrapeVenues).not.toHaveBeenCalled();

    expect(result.success).toBe(false);
    expect(result.totalVenuesFailed).toBe(2);
    expect(result.venueResults.map((r) => r.venueId).sort()).toEqual([
      "chain-broken",
      "chain-ok",
    ]);
  });
});
