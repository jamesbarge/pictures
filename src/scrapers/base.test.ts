import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseScraper } from "./base";
import type { RawScreening, ScraperConfig } from "./types";

class TestScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "test-cinema",
    baseUrl: "https://example.test/",
    requestsPerMinute: 60,
    delayBetweenRequests: 0,
  };
  // Stubbed abstract methods — we only exercise healthCheck() here.
  protected async fetchPages(): Promise<string[]> {
    return [];
  }
  protected async parsePages(): Promise<RawScreening[]> {
    return [];
  }
}

describe("BaseScraper.healthCheck — retry-with-backoff", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns true on first-attempt 200", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const result = await new TestScraper().healthCheck();
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rescues the Close-Up pattern: transient 5xx → success on retry 2", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const scraper = new TestScraper();
    const promise = scraper.healthCheck();

    // Tick the 4s backoff after the first failure
    await vi.advanceTimersByTimeAsync(4_000);

    const result = await promise;
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 4xx — fast-fails because that's a contract issue, not a transient blip", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const result = await new TestScraper().healthCheck();
    expect(result).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on a network error and recovers", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const scraper = new TestScraper();
    const promise = scraper.healthCheck();
    await vi.advanceTimersByTimeAsync(4_000);

    const result = await promise;
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after 3 attempts when site stays down", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const scraper = new TestScraper();
    const promise = scraper.healthCheck();
    // Two backoffs between attempts 1→2 and 2→3 = 8s total
    await vi.advanceTimersByTimeAsync(8_000);

    const result = await promise;
    expect(result).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
