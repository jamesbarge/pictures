import { describe, expect, it, vi } from "vitest";
import { CurzonScraper } from "./curzon";
import { EverymanScraper } from "./everyman";
import { PicturehouseScraper } from "./picturehouse";
import { FestivalDetector } from "../festivals/festival-detector";

describe("chain scraper failure propagation", () => {
  it("omits failed Everyman venues and records their errors", async () => {
    const scraper = new EverymanScraper();
    scraper.chainConfig = { ...scraper.chainConfig, delayBetweenRequests: 0 };
    vi.spyOn(scraper, "scrapeVenue").mockRejectedValueOnce(new Error("schedule unavailable"));

    const results = await scraper.scrapeVenues(["everyman-baker-street"]);

    expect(results.has("everyman-baker-street")).toBe(false);
    expect(scraper.venueErrors.get("everyman-baker-street")).toBe("schedule unavailable");
  });

  it("keeps valid empty Everyman venue results distinct from failures", async () => {
    const scraper = new EverymanScraper();
    scraper.chainConfig = { ...scraper.chainConfig, delayBetweenRequests: 0 };
    vi.spyOn(scraper, "scrapeVenue").mockResolvedValueOnce([]);

    const results = await scraper.scrapeVenues(["everyman-baker-street"]);

    expect(results.has("everyman-baker-street")).toBe(true);
    expect(results.get("everyman-baker-street")).toEqual([]);
    expect(scraper.venueErrors.has("everyman-baker-street")).toBe(false);
  });

  it("omits failed Picturehouse venues and records their errors", async () => {
    const scraper = new PicturehouseScraper();
    scraper.chainConfig = { ...scraper.chainConfig, delayBetweenRequests: 0 };
    vi.spyOn(scraper, "scrapeVenue").mockRejectedValueOnce(new Error("invalid API response"));

    const results = await scraper.scrapeVenues(["picturehouse-central"]);

    expect(results.has("picturehouse-central")).toBe(false);
    expect(scraper.venueErrors.get("picturehouse-central")).toBe("invalid API response");
  });

  it("rejects a total Curzon auth failure and still cleans up", async () => {
    const scraper = new CurzonScraper();
    const privateMethods = scraper as unknown as {
      initialize: () => Promise<void>;
      cleanup: () => Promise<void>;
    };
    vi.spyOn(FestivalDetector, "preload").mockResolvedValue();
    const initialize = vi.spyOn(privateMethods, "initialize").mockResolvedValue();
    const cleanup = vi.spyOn(privateMethods, "cleanup").mockResolvedValue();

    await expect(scraper.scrapeVenues(["curzon-soho"]))
      .rejects.toThrow("Failed to capture Curzon auth token");
    expect(initialize).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
