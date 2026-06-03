import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./fetch-with-retry";

// Tests use vi.useFakeTimers() so the 2-second retry backoff doesn't actually
// burn 2s of wall-clock per test. The real fetch is replaced with a vi.fn()
// mock — the function-under-test is module-scoped, not injected, so we mock
// globalThis.fetch.

const originalFetch = globalThis.fetch;

function makeResponse(
  status: number,
  contentLength?: number | null,
): Response {
  const headers = new Headers();
  if (contentLength !== null && contentLength !== undefined) {
    headers.set("content-length", String(contentLength));
  }
  return new Response("", { status, headers });
}

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("returns the response on the first try when it's ok", async () => {
    const mock = vi.fn().mockResolvedValue(makeResponse(200));
    globalThis.fetch = mock;

    const result = await fetchWithRetry("https://example.com");
    expect(result.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("returns the response on the first try when status is 4xx (no retry on client errors)", async () => {
    // The retry only fires for status >= 500 or network errors. 4xx returns immediately.
    const mock = vi.fn().mockResolvedValue(makeResponse(404));
    globalThis.fetch = mock;

    const result = await fetchWithRetry("https://example.com");
    expect(result.status).toBe(404);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("retries once on 5xx server errors", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(200));
    globalThis.fetch = mock;

    const promise = fetchWithRetry("https://example.com");
    // Advance through the 2s backoff.
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("retries once on network errors (fetch rejects)", async () => {
    const mock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce(makeResponse(200));
    globalThis.fetch = mock;

    const promise = fetchWithRetry("https://example.com");
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("returns the second attempt's response even if it also fails (no double retry)", async () => {
    // The implementation retries exactly ONCE. Pin this so future refactors
    // don't accidentally add a third attempt.
    const mock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(503));
    globalThis.fetch = mock;

    const promise = fetchWithRetry("https://example.com");
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result.status).toBe(503);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("throws when Content-Length exceeds the default 10MB limit (both attempts)", async () => {
    // Size-limit failure goes through catch + 2s retry. Both attempts will
    // throw the same way (same mocked response), so the final rejection
    // bubbles up. Documenting that size-limit IS retried by the current
    // implementation — a refactor could choose to skip retry on size errors,
    // and that would need a test change.
    const eleven_mb = 11 * 1024 * 1024;
    const mock = vi.fn().mockResolvedValue(makeResponse(200, eleven_mb));
    globalThis.fetch = mock;

    const promise = fetchWithRetry("https://example.com");
    // Catch unhandled rejection during timer advance.
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).rejects.toThrow(/Response size .* exceeds limit/);
    expect(mock).toHaveBeenCalledTimes(2); // first attempt + retry, both fail
  });

  it("respects a custom maxResponseSize", async () => {
    const oneMb = 1 * 1024 * 1024;
    const mock = vi.fn().mockResolvedValue(makeResponse(200, oneMb + 1));
    globalThis.fetch = mock;

    const promise = fetchWithRetry("https://example.com", {
      maxResponseSize: oneMb,
    });
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).rejects.toThrow(/Response size .* exceeds limit of/);
  });

  it("ignores missing Content-Length header (no size check)", async () => {
    // If the server doesn't send Content-Length, the size guard is skipped.
    const mock = vi.fn().mockResolvedValue(makeResponse(200, null));
    globalThis.fetch = mock;

    const result = await fetchWithRetry("https://example.com");
    expect(result.status).toBe(200);
  });

  it("uses the provided label in the size-exceeded error message", async () => {
    const eleven_mb = 11 * 1024 * 1024;
    const mock = vi.fn().mockResolvedValue(makeResponse(200, eleven_mb));
    globalThis.fetch = mock;

    const promise = fetchWithRetry(
      "https://example.com",
      undefined,
      "BFI-PDF",
    );
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).rejects.toThrow(/^BFI-PDF:/);
  });

  it("forwards options (method, headers) to the underlying fetch call", async () => {
    const mock = vi.fn().mockResolvedValue(makeResponse(200));
    globalThis.fetch = mock;

    await fetchWithRetry("https://example.com", {
      method: "POST",
      headers: { "x-test": "1" },
    });
    expect(mock).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        method: "POST",
        headers: { "x-test": "1" },
      }),
    );
  });
});
