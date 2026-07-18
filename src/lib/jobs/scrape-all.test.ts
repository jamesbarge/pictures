/**
 * Tests for the scrape-all run-level circuit breaker (plan 001).
 *
 * Exercises createRunBreaker + runWithConcurrency directly with synthetic
 * tasks — the same machinery runScrapeAll threads through its waves.
 */
import { describe, it, expect, vi } from "vitest";

// scrape-all imports the DB, registry, and runner factory at module level.
// None of them should touch real infrastructure in unit tests.
vi.mock("@/db", () => ({
  db: {},
  isDatabaseAvailable: false,
  withDbTimeout: <T>(p: Promise<T>) => p,
  schema: {},
}));
vi.mock("@/scrapers/pipeline", () => ({
  processScreenings: vi.fn(),
  saveScreenings: vi.fn(),
  ensureCinemaExists: vi.fn(),
}));
vi.mock("@/scrapers/registry", () => ({
  SCRAPER_REGISTRY: [],
}));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(async () => true),
}));
vi.mock("@/lib/scrape-progress", () => ({
  stampProgress: vi.fn(async () => {}),
}));

import { breakerOutcomeFor, createRunBreaker, runWithConcurrency } from "./scrape-all";

const CONN_ERROR = "getOrCreateFilm: Film X timeout after 20000ms (client-side)";
const SITE_ERROR = "Health check failed - site not accessible";

describe("createRunBreaker", () => {
  it("trips after K consecutive connection failures", () => {
    const onTrip = vi.fn();
    const breaker = createRunBreaker(3, onTrip);

    breaker.record("cinema-a", { succeeded: false, errors: [CONN_ERROR] });
    breaker.record("cinema-b", { succeeded: false, errors: [CONN_ERROR] });
    expect(breaker.isTripped()).toBe(false);

    breaker.record("cinema-c", { succeeded: false, errors: [CONN_ERROR] });
    expect(breaker.isTripped()).toBe(true);
    expect(onTrip).toHaveBeenCalledTimes(1);
    expect(onTrip).toHaveBeenCalledWith("cinema-c", 3, CONN_ERROR);
  });

  it("resets the counter on an interleaved success", () => {
    const breaker = createRunBreaker(3);

    breaker.record("cinema-a", { succeeded: false, errors: [CONN_ERROR] });
    breaker.record("cinema-b", { succeeded: false, errors: [CONN_ERROR] });
    breaker.record("cinema-c", { succeeded: true });
    breaker.record("cinema-d", { succeeded: false, errors: [CONN_ERROR] });
    breaker.record("cinema-e", { succeeded: false, errors: [CONN_ERROR] });

    expect(breaker.isTripped()).toBe(false);
  });

  it("does not count ordinary site failures toward the breaker", () => {
    const breaker = createRunBreaker(3);

    breaker.record("cinema-a", { succeeded: false, errors: [CONN_ERROR] });
    breaker.record("cinema-b", { succeeded: false, errors: [CONN_ERROR] });
    // A normal scrape failure resets the consecutive-connection count.
    breaker.record("cinema-c", { succeeded: false, errors: [SITE_ERROR] });
    breaker.record("cinema-d", { succeeded: false, errors: [CONN_ERROR] });
    breaker.record("cinema-e", { succeeded: false, errors: [CONN_ERROR] });

    expect(breaker.isTripped()).toBe(false);
  });

  it("warns once (never aborts) after N consecutive failures of any type", () => {
    const onWarn = vi.fn();
    const breaker = createRunBreaker(3, undefined, 4, onWarn);

    // Mixed failure types — connection counter keeps resetting, but the
    // any-type streak accumulates.
    breaker.record("a", { succeeded: false, errors: [SITE_ERROR] });
    breaker.record("b", { succeeded: false, errors: [CONN_ERROR] });
    breaker.record("c", { succeeded: false, errors: [SITE_ERROR] });
    expect(onWarn).not.toHaveBeenCalled();

    breaker.record("d", { succeeded: false, errors: [SITE_ERROR] });
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onWarn).toHaveBeenCalledWith("d", 4, SITE_ERROR);
    expect(breaker.isTripped()).toBe(false); // warn ≠ abort

    // One-shot: a longer streak doesn't re-fire.
    breaker.record("e", { succeeded: false, errors: [SITE_ERROR] });
    expect(onWarn).toHaveBeenCalledTimes(1);
  });

  it("resets the any-type streak on success and reports a fallback error message", () => {
    const onWarn = vi.fn();
    const breaker = createRunBreaker(3, undefined, 2, onWarn);

    breaker.record("a", { succeeded: false, errors: [SITE_ERROR] });
    breaker.record("b", { succeeded: true });
    breaker.record("c", { succeeded: false, errors: [SITE_ERROR] });
    expect(onWarn).not.toHaveBeenCalled();

    // Failure with no error strings still counts, with a fallback message.
    breaker.record("d", { succeeded: false });
    expect(onWarn).toHaveBeenCalledWith("d", 2, "scraper returned success=false");
  });
});

describe("breakerOutcomeFor (entry → breaker seam)", () => {
  it("treats a failed entry that still wrote screenings as breaker-success", () => {
    // 12-venue chain, 11 ok + 1 site timeout: the DB demonstrably works.
    const outcome = breakerOutcomeFor({
      success: false,
      totalScreeningsAdded: 14,
      totalScreeningsUpdated: 230,
      venueResults: [
        { success: true },
        { success: false, error: "page.goto: Timeout 30000ms exceeded" },
      ],
    });
    expect(outcome.succeeded).toBe(true);
  });

  it("feeds a zero-write failure's errors to the breaker, and a wall-clock-capped venue counts toward a trip", () => {
    const capError = "Venue rio-dalston timeout after 600000ms (venue wall-clock cap)";
    const outcome = breakerOutcomeFor({
      success: false,
      totalScreeningsAdded: 0,
      totalScreeningsUpdated: 0,
      venueResults: [{ success: false, error: capError }],
    });
    expect(outcome).toEqual({ succeeded: false, errors: [capError] });

    const breaker = createRunBreaker(3);
    breaker.record("a", outcome);
    breaker.record("b", outcome);
    breaker.record("c", outcome);
    expect(breaker.isTripped()).toBe(true);
  });

  it("does not let a venue-website nav timeout count toward the breaker", () => {
    const outcome = breakerOutcomeFor({
      success: false,
      totalScreeningsAdded: 0,
      totalScreeningsUpdated: 0,
      venueResults: [{ success: false, error: "page.goto: Timeout 30000ms exceeded" }],
    });
    const breaker = createRunBreaker(1);
    breaker.record("a", outcome);
    expect(breaker.isTripped()).toBe(false);
  });
});

describe("runWithConcurrency with a breaker", () => {
  it("stops pulling new tasks once tripped and records the rest as tripped", async () => {
    const breaker = createRunBreaker(3);
    const started: number[] = [];

    const tasks = Array.from({ length: 6 }, (_, i) => async () => {
      started.push(i);
      breaker.record(`cinema-${i}`, { succeeded: false, errors: [CONN_ERROR] });
      return { succeeded: false as const };
    });

    // limit 1 → deterministic sequential order
    const results = await runWithConcurrency(tasks, 1, breaker.isTripped);

    expect(started).toEqual([0, 1, 2]);
    expect(breaker.isTripped()).toBe(true);
    expect(results).toHaveLength(6);
    for (const i of [0, 1, 2]) {
      expect(results[i].status).toBe("fulfilled");
    }
    for (const i of [3, 4, 5]) {
      const r = results[i];
      expect(r.status).toBe("rejected");
      if (r.status === "rejected") {
        expect(String(r.reason)).toMatch(/circuit breaker tripped/);
      }
    }
  });

  it("completes all tasks when the breaker never trips", async () => {
    const breaker = createRunBreaker(3);
    const started: number[] = [];

    const tasks = Array.from({ length: 4 }, (_, i) => async () => {
      started.push(i);
      // connection failure followed by a success resets the counter
      breaker.record(
        `cinema-${i}`,
        i % 2 === 0 ? { succeeded: false, errors: [CONN_ERROR] } : { succeeded: true },
      );
      return { succeeded: true as const };
    });

    const results = await runWithConcurrency(tasks, 2, breaker.isTripped);

    expect(started.sort()).toEqual([0, 1, 2, 3]);
    expect(breaker.isTripped()).toBe(false);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });
});
