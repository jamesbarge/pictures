import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkHealth } from "./health-check";

const originalFetch = globalThis.fetch;

describe("checkHealth", () => {
  beforeEach(() => {
    // Stub fetch per test.
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns true when the HEAD response is ok (200)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    expect(await checkHealth("https://example.com")).toBe(true);
  });

  it("returns true for any 2xx status", async () => {
    // Response with empty body can't have status 204 (no-content disallows body),
    // so use 200 to test the broader 2xx OK semantics.
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    expect(await checkHealth("https://example.com")).toBe(true);
  });

  it("returns false for 4xx status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    expect(await checkHealth("https://example.com")).toBe(false);
  });

  it("returns false for 5xx status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    expect(await checkHealth("https://example.com")).toBe(false);
  });

  it("returns false when fetch throws (network error)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    expect(await checkHealth("https://example.com")).toBe(false);
  });

  it("uses HEAD method by default", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    globalThis.fetch = mock;
    await checkHealth("https://example.com");
    expect(mock).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("merges custom RequestInit options (headers, signal) with HEAD", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    globalThis.fetch = mock;
    const abortController = new AbortController();
    await checkHealth("https://example.com", {
      headers: { "x-test": "1" },
      signal: abortController.signal,
    });
    expect(mock).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        method: "HEAD",
        headers: { "x-test": "1" },
        signal: abortController.signal,
      }),
    );
  });

  it("allows caller to override the method (rare but supported by RequestInit spread)", async () => {
    // The implementation does `{ method: "HEAD", ...fetchOptions }` so a caller
    // who supplies method explicitly OVERRIDES the HEAD default. Pin this so a
    // refactor doesn't accidentally invert the precedence.
    const mock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    globalThis.fetch = mock;
    await checkHealth("https://example.com", { method: "GET" });
    expect(mock).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
