import { describe, expect, it, vi } from "vitest";
import { BarbicanScraper } from "./barbican";
import { FestivalDetector } from "../festivals/festival-detector";

describe("independent scraper failure propagation", () => {
  it("rejects a Barbican scrape when any day page fails to fetch", async () => {
    const scraper = new BarbicanScraper();
    const internals = scraper as unknown as {
      fetchPages: () => Promise<string[]>;
      fetchUrl: (url: string) => Promise<string>;
    };
    vi.spyOn(internals, "fetchUrl")
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValue("<html></html>");

    await expect(internals.fetchPages()).rejects.toThrow(
      "Failed to fetch 1/30 Barbican day pages",
    );
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
