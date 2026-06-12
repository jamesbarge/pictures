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

import { createRunBreaker, runWithConcurrency } from "./scrape-all";

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
