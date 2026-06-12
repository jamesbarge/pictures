/**
 * Tests for runner-factory: connection-error classification and the
 * per-venue wall-clock cap (plan 001 — scrape circuit breaker).
 */
import { describe, it, expect, vi } from "vitest";

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

import { isConnectionError } from "./runner-factory";

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
    expect(isConnectionError(new Error("timeout exceeded when trying to connect"))).toBe(true);
    expect(isConnectionError(new Error("max client connections reached (pool)"))).toBe(true);
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
  });

  it("handles non-Error values", () => {
    expect(isConnectionError("ETIMEDOUT: socket timeout")).toBe(true);
    expect(isConnectionError("no showtimes found")).toBe(false);
    expect(isConnectionError(undefined)).toBe(false);
  });
});
