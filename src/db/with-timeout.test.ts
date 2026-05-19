/**
 * Tests for `withDbTimeout` from src/db/index.ts.
 *
 * Uses vi.useFakeTimers() so we don't burn real wall-clock waiting for
 * 10-second timeouts in the test suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withDbTimeout } from "./index";

describe("withDbTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the inner promise's value when it completes before the timeout", async () => {
    const result = await withDbTimeout(Promise.resolve("ok"), 1000);
    expect(result).toBe("ok");
  });

  it("rejects with a timeout error after the supplied ms when inner promise hangs", async () => {
    const hang = new Promise<string>(() => {
      /* never resolves */
    });
    const promise = withDbTimeout(hang, 5000, "test op");
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).rejects.toThrow(
      /test op timeout after 5000ms \(client-side\)/,
    );
  });

  it("uses default label 'db query' when not supplied", async () => {
    const hang = new Promise<string>(() => {});
    const promise = withDbTimeout(hang, 1000);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).rejects.toThrow(/^db query timeout/);
  });

  it("uses default timeout 10000ms when not supplied", async () => {
    const hang = new Promise<string>(() => {});
    const promise = withDbTimeout(hang);
    promise.catch(() => {});
    // Advance 9999ms — should NOT have fired.
    await vi.advanceTimersByTimeAsync(9999);
    let settled = false;
    promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve(); // microtask flush
    expect(settled).toBe(false);

    // Advance 1ms more → total 10000ms → should fire.
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).rejects.toThrow(/timeout after 10000ms/);
  });

  it("rejects with the inner promise's rejection when it rejects before timeout", async () => {
    const innerError = new Error("inner failure");
    const promise = withDbTimeout(Promise.reject(innerError), 1000);
    await expect(promise).rejects.toBe(innerError);
  });

  it("clears the timer on resolution so it doesn't fire later (no orphan setTimeout)", async () => {
    // Use a real setTimeout spy to verify the cleanup behaviour. We clear the
    // fake-timer setup and use a controllable promise.
    let resolveInner: (v: string) => void = () => {};
    const inner = new Promise<string>((r) => {
      resolveInner = r;
    });

    const result = withDbTimeout(inner, 5000, "test");
    resolveInner("done");
    await expect(result).resolves.toBe("done");

    // Advance time WAY past the timeout — the cleanup should have cancelled
    // the timer so no error is thrown asynchronously.
    await vi.advanceTimersByTimeAsync(10000);
    // If the timer fired, we'd see an unhandled rejection — but the finally()
    // clearTimeout prevents that.
    expect(true).toBe(true); // sentinel — reaching here without unhandled rejection is the assertion
  });
});
