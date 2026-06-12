/**
 * Deferred-write retry queue (plan 010, step 2)
 *
 * Scenario being recovered: `insertScreening … timeout after 15000ms
 * (client-side)` under Supabase pooler contention cost 19 screenings at
 * electric-white-city on 2026-06-11 with no retry. Connection-shaped
 * failures (classified by isConnectionError from runner-factory) are queued
 * and retried once, serially, after the venue's film loop. Non-connection
 * errors (FK violations, bad data) must NOT be retried — they rethrow to
 * the film-level catch as before.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  attemptScreeningWrite,
  retryDeferredWrites,
  type DeferredWrite,
} from "./pipeline";

/** Same shape withDbTimeout rejects with — matched by isConnectionError via "(client-side)". */
const connectionTimeoutError = () =>
  new Error("insertScreening: castle/castle-123 timeout after 15000ms (client-side)");

/** A non-connection DB failure that must never be deferred. */
const fkViolationError = () =>
  new Error('insert or update on table "screenings" violates foreign key constraint "screenings_film_id_films_id_fk"');

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("attemptScreeningWrite", () => {
  it("returns added/updated on success without touching the queue", async () => {
    const deferred: DeferredWrite[] = [];
    expect(await attemptScreeningWrite("w1", async () => true, deferred)).toBe("added");
    expect(await attemptScreeningWrite("w2", async () => false, deferred)).toBe("updated");
    expect(deferred).toHaveLength(0);
  });

  it("defers connection-timeout failures with the runnable thunk", async () => {
    const deferred: DeferredWrite[] = [];
    const run = vi.fn().mockRejectedValueOnce(connectionTimeoutError()).mockResolvedValueOnce(true);

    const status = await attemptScreeningWrite("insertScreening: castle/castle-123", run, deferred);

    expect(status).toBe("deferred");
    expect(deferred).toHaveLength(1);
    expect(deferred[0].label).toBe("insertScreening: castle/castle-123");
    expect(deferred[0].run).toBe(run);
  });

  it("rethrows non-connection errors (FK violation) — never retried", async () => {
    const deferred: DeferredWrite[] = [];
    const run = vi.fn().mockRejectedValue(fkViolationError());

    await expect(attemptScreeningWrite("w", run, deferred)).rejects.toThrow(/foreign key/);
    expect(deferred).toHaveLength(0);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("drops connection failures beyond the per-venue cap", async () => {
    const deferred: DeferredWrite[] = [];
    const failing = () => Promise.reject(connectionTimeoutError());

    expect(await attemptScreeningWrite("w1", failing, deferred, 2)).toBe("deferred");
    expect(await attemptScreeningWrite("w2", failing, deferred, 2)).toBe("deferred");
    expect(await attemptScreeningWrite("w3", failing, deferred, 2)).toBe("dropped");
    expect(deferred).toHaveLength(2);
  });
});

describe("retryDeferredWrites", () => {
  it("recovers a write that fails once then succeeds", async () => {
    const deferred: DeferredWrite[] = [];
    // Fails the first (film-loop) attempt, succeeds on the retry pass.
    const run = vi.fn().mockRejectedValueOnce(connectionTimeoutError()).mockResolvedValueOnce(true);
    await attemptScreeningWrite("w", run, deferred);

    const outcome = await retryDeferredWrites(deferred, 0);

    expect(outcome).toEqual({ recovered: 1, added: 1, updated: 0, failed: 0 });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("counts a recovered update (duplicate row refreshed) as updated", async () => {
    const deferred: DeferredWrite[] = [{ label: "w", run: async () => false }];

    const outcome = await retryDeferredWrites(deferred, 0);

    expect(outcome).toEqual({ recovered: 1, added: 0, updated: 1, failed: 0 });
  });

  it("a twice-failing write lands in failed — second failure is final this run", async () => {
    const deferred: DeferredWrite[] = [];
    const run = vi.fn().mockRejectedValue(connectionTimeoutError());
    await attemptScreeningWrite("w", run, deferred);

    const outcome = await retryDeferredWrites(deferred, 0);

    expect(outcome).toEqual({ recovered: 0, added: 0, updated: 0, failed: 1 });
    expect(run).toHaveBeenCalledTimes(2); // once in the loop, once on retry — no third attempt
  });

  it("retries serially in queue order", async () => {
    const order: string[] = [];
    const deferred: DeferredWrite[] = ["a", "b", "c"].map((label) => ({
      label,
      run: async () => {
        order.push(label);
        return true;
      },
    }));

    const outcome = await retryDeferredWrites(deferred, 0);

    expect(order).toEqual(["a", "b", "c"]);
    expect(outcome.recovered).toBe(3);
  });

  it("one retry failure does not stop the rest of the queue", async () => {
    const deferred: DeferredWrite[] = [
      { label: "ok-1", run: async () => true },
      { label: "bad", run: () => Promise.reject(connectionTimeoutError()) },
      { label: "ok-2", run: async () => true },
    ];

    const outcome = await retryDeferredWrites(deferred, 0);

    expect(outcome).toEqual({ recovered: 2, added: 2, updated: 0, failed: 1 });
  });

  it("stops retrying when the time budget is exhausted, counting the rest as failed", async () => {
    // Budget 0 → exhausted before the first attempt; no thunk may run. This
    // bounds the retry pass under plan 001's 10-minute venue wall-clock cap.
    const run = vi.fn().mockResolvedValue(true);
    const deferred: DeferredWrite[] = [
      { label: "w1", run },
      { label: "w2", run },
      { label: "w3", run },
    ];

    const outcome = await retryDeferredWrites(deferred, 0, 0);

    expect(outcome).toEqual({ recovered: 0, added: 0, updated: 0, failed: 3 });
    expect(run).not.toHaveBeenCalled();
  });

  it("budget exhaustion mid-queue keeps earlier recoveries", async () => {
    const slow = vi.fn().mockImplementation(
      () => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 30)),
    );
    const never = vi.fn().mockResolvedValue(true);
    const deferred: DeferredWrite[] = [
      { label: "slow", run: slow },
      { label: "skipped", run: never },
    ];

    // 10ms budget: the first write starts (budget not yet exhausted) and
    // recovers; by the second iteration the budget is spent.
    const outcome = await retryDeferredWrites(deferred, 0, 10);

    expect(outcome).toEqual({ recovered: 1, added: 1, updated: 0, failed: 1 });
    expect(never).not.toHaveBeenCalled();
  });
});
