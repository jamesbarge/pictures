import { describe, expect, it, vi } from "vitest";
import { BarbicanScraper } from "./barbican";
import { FestivalDetector } from "../festivals/festival-detector";

/** The 70 sequential day-page URLs Barbican's fetchPages() walks, in order. */
function urlOrder() {
  const order: string[] = [];
  return (url: string) => {
    if (!order.includes(url)) order.push(url);
    return order.indexOf(url) + 1; // 1-based day number
  };
}

function internalsOf(scraper: BarbicanScraper) {
  const internals = scraper as unknown as {
    fetchPages: () => Promise<string[]>;
    fetchUrl: (url: string) => Promise<string>;
    parsePages: (pages: string[]) => Promise<unknown[]>;
    delay: (ms: number) => Promise<void>;
  };
  // Skip the retry backoff — fetchUrl is stubbed, so no real request is paced.
  vi.spyOn(internals, "delay").mockResolvedValue(undefined);
  return internals;
}

describe("independent scraper failure propagation", () => {
  it("rejects a Barbican scrape when a day page fails every attempt", async () => {
    const internals = internalsOf(new BarbicanScraper());
    const dayNumber = urlOrder();
    const fetchUrl = vi.spyOn(internals, "fetchUrl").mockImplementation(async (url: string) => {
      if (dayNumber(url) === 3) throw new Error("network unavailable");
      return "<html></html>";
    });

    await expect(internals.fetchPages()).rejects.toThrow(
      /Failed to fetch Barbican day page .* after 2 attempts \(day 3\/70\)/,
    );
    // And it stops there: 2 good days + day 3 twice. The whole batch is
    // all-or-nothing, so walking the remaining 67 days would only waste
    // requests against a venue that has already errored.
    expect(fetchUrl).toHaveBeenCalledTimes(4);
  });

  it("retries a transient day-page failure instead of failing the whole venue", async () => {
    const internals = internalsOf(new BarbicanScraper());
    vi.spyOn(internals, "fetchUrl")
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValue("<html></html>");

    // One blip on day 1 used to cost Barbican its entire nightly run.
    await expect(internals.fetchPages()).resolves.toHaveLength(70);
  });

  it("does not walk the whole calendar when failures alternate with successes", async () => {
    // Regression guard. A `MAX_CONSECUTIVE_FAILURES = 3` tolerance used to sit in
    // fetchPages, but every success reset the counter — so a site failing every
    // other day never tripped it, and Barbican made all 70 day requests plus 35
    // retries before the post-loop throw discarded every one. At up to 70s per
    // failing day that also threatened VENUE_TIMEOUT_MS (600s).
    const internals = internalsOf(new BarbicanScraper());
    const dayNumber = urlOrder();
    const fetchUrl = vi.spyOn(internals, "fetchUrl").mockImplementation(async (url: string) => {
      if (dayNumber(url) % 2 === 0) throw new Error("HTTP 429: Too Many Requests");
      return "<html></html>";
    });

    await expect(internals.fetchPages()).rejects.toThrow(
      /Failed to fetch Barbican day page .* \(day 2\/70\)/,
    );
    // Day 1 once + day 2 twice. Emphatically not 105.
    expect(fetchUrl).toHaveBeenCalledTimes(3);
  });

  it("rejects a Barbican scrape when any fetched day page cannot be parsed", async () => {
    const scraper = new BarbicanScraper();
    const internals = scraper as unknown as {
      parsePages: (pages: string[]) => Promise<unknown[]>;
    };
    vi.spyOn(FestivalDetector, "preload").mockResolvedValue();

    await expect(internals.parsePages(["not-json"])).rejects.toThrow(
      "Failed to parse 1/1 Barbican day pages",
    );
  });
});
