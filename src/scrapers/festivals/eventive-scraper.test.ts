/**
 * Eventive Scraper Tests
 *
 * Tests the Eventive festival scraper with mocked API responses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the eventive client
vi.mock("./eventive-client", () => ({
  getFilms: vi.fn(),
  getEvents: vi.fn(),
  discoverEventBucket: vi.fn(),
}));

// Mock the pipeline (don't actually save to DB).
//
// The stub carries the FULL PipelineResult shape on purpose. It is inside a
// vi.mock factory, so TypeScript does not check it against the real return
// type, and a partial stub silently turned the ingester's
// `total += result.postWriteFailures` into NaN.
vi.mock("@/scrapers/pipeline", () => ({
  saveScreenings: vi.fn().mockResolvedValue({
    cinemaId: "the-nickel",
    added: 0,
    updated: 0,
    failed: 0,
    rejected: 0,
    rejectedByReason: {},
    accepted: 0,
    write: { upserted: 0, updated: 0, unchanged: 0, failed: 0 },
    postWriteFailures: 0,
    blocked: false,
    scrapedAt: new Date("2026-08-15T12:00:00Z"),
  }),
}));

import {
  scrapeEventiveFestival,
  scrapeActiveEventiveFestivals,
  EVENTIVE_FESTIVALS,
} from "./eventive-scraper";
import { saveScreenings } from "@/scrapers/pipeline";
import { getFilms, getEvents, discoverEventBucket } from "./eventive-client";

const mockFilms = [
  {
    id: "film1",
    name: "The Horror Within",
    runtime_minutes: 95,
    year: 2026,
    directors: ["Jane Director"],
    poster_url: "https://cdn.eventive.org/posters/film1.jpg",
    tags: ["Feature"],
    sections: ["Main Competition"],
  },
  {
    id: "film2",
    name: "Night Terrors",
    runtime_minutes: 88,
    year: 2025,
    directors: ["John Filmmaker"],
    still_url: "https://cdn.eventive.org/stills/film2.jpg",
    tags: ["Short"],
    sections: ["Shorts Showcase"],
  },
];

const mockEvents = [
  {
    id: "evt1",
    name: "The Horror Within - Premiere",
    event_bucket: "bucket123",
    film_ids: ["film1"],
    start_time: "2026-08-28T19:00:00Z",
    end_time: "2026-08-28T21:00:00Z",
    venue: { id: "v1", name: "Prince Charles Cinema" },
    ticket_buckets: [
      { id: "t1", name: "Standard", price: 15, sold_out: false, available: 50 },
    ],
    tags: ["Evening Screening"],
  },
  {
    id: "evt2",
    name: "Night Terrors + Q&A",
    event_bucket: "bucket123",
    film_ids: ["film2"],
    start_time: "2026-08-29T14:00:00Z",
    venue: { id: "v1", name: "Prince Charles Cinema" },
    ticket_buckets: [
      { id: "t2", name: "Standard", price: 12, sold_out: true, available: 0 },
    ],
    tags: ["Afternoon Screening"],
  },
  {
    id: "evt3",
    name: "Mystery Venue Screening",
    event_bucket: "bucket123",
    film_ids: ["film1"],
    start_time: "2026-08-30T20:00:00Z",
    venue: { id: "v2", name: "Unknown Cinema" },
    ticket_buckets: [],
  },
  {
    id: "evt4",
    name: "Special Event - No Film",
    event_bucket: "bucket123",
    film_ids: [],
    start_time: "2026-08-27T18:00:00Z",
    venue: { id: "v1", name: "Prince Charles Cinema" },
    ticket_buckets: [
      { id: "t3", name: "Standard", price: 10, sold_out: false, available: 3 },
    ],
  },
  {
    id: "evt5",
    name: "No Venue Event",
    event_bucket: "bucket123",
    film_ids: ["film1"],
    start_time: "2026-08-31T12:00:00Z",
    venue: undefined,
  },
];

describe("EVENTIVE_FESTIVALS", () => {
  it("should have configs for FrightFest and UKJFF", () => {
    expect(EVENTIVE_FESTIVALS).toHaveLength(2);
    const slugs = EVENTIVE_FESTIVALS.map((f) => f.slugBase);
    expect(slugs).toContain("frightfest");
    expect(slugs).toContain("ukjff");
  });

  it("should generate correct subdomains", () => {
    const ff = EVENTIVE_FESTIVALS.find((f) => f.slugBase === "frightfest")!;
    expect(ff.subdomain(2026)).toBe("frightfest26");

    const ukjff = EVENTIVE_FESTIVALS.find((f) => f.slugBase === "ukjff")!;
    expect(ukjff.subdomain(2026)).toBe("ukjewishfilmfestival2026");
  });
});

describe("scrapeEventiveFestival", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (discoverEventBucket as ReturnType<typeof vi.fn>).mockResolvedValue("bucket123");
    (getFilms as ReturnType<typeof vi.fn>).mockResolvedValue(mockFilms);
    (getEvents as ReturnType<typeof vi.fn>).mockResolvedValue(mockEvents);
  });

  it("should join films and events into RawScreenings", async () => {
    const { screenings } = await scrapeEventiveFestival("frightfest", 2026);

    // evt1 (film1 at PCC), evt2 (film2 at PCC), evt4 (no film at PCC) = 3 mapped
    // evt3 (unknown venue) and evt5 (no venue) are skipped
    expect(screenings).toHaveLength(3);
  });

  it("should map film data to screening fields", async () => {
    const { screenings } = await scrapeEventiveFestival("frightfest", 2026);

    const horror = screenings.find((s) => s.filmTitle === "The Horror Within");
    expect(horror).toBeDefined();
    expect(horror!.datetime).toEqual(new Date("2026-08-28T19:00:00Z"));
    expect(horror!.year).toBe(2026);
    expect(horror!.director).toBe("Jane Director");
    expect(horror!.posterUrl).toBe("https://cdn.eventive.org/posters/film1.jpg");
    expect(horror!.festivalSlug).toBe("frightfest-2026");
    expect(horror!.sourceId).toBe("eventive-evt1");
  });

  it("should resolve venue names to canonical cinema IDs", async () => {
    const { screenings } = await scrapeEventiveFestival("frightfest", 2026);

    for (const s of screenings) {
      expect((s as unknown as { cinemaId: string }).cinemaId).toBe("prince-charles");
    }
  });

  it("should log and skip unknown venues", async () => {
    const { skippedVenues } = await scrapeEventiveFestival("frightfest", 2026);

    expect(skippedVenues).toContain("Unknown Cinema");
    expect(skippedVenues).toContain("(no venue)");
  });

  it("should map tags to festivalSection", async () => {
    const { screenings } = await scrapeEventiveFestival("frightfest", 2026);

    const horror = screenings.find((s) => s.filmTitle === "The Horror Within");
    // Event tag takes priority over film section
    expect(horror!.festivalSection).toBe("Evening Screening");
  });

  it("should handle events without films", async () => {
    const { screenings } = await scrapeEventiveFestival("frightfest", 2026);

    const special = screenings.find(
      (s) => s.filmTitle === "Special Event - No Film"
    );
    expect(special).toBeDefined();
    expect(special!.festivalSlug).toBe("frightfest-2026");
  });

  it("should detect sold-out ticket status", async () => {
    const { screenings } = await scrapeEventiveFestival("frightfest", 2026);

    const soldOut = screenings.find((s) => s.filmTitle === "Night Terrors");
    expect(soldOut!.availabilityStatus).toBe("sold_out");
  });

  it("should detect available ticket status", async () => {
    const { screenings } = await scrapeEventiveFestival("frightfest", 2026);

    const available = screenings.find(
      (s) => s.filmTitle === "The Horror Within"
    );
    expect(available!.availabilityStatus).toBe("available");
  });

  it("should detect low availability", async () => {
    const { screenings } = await scrapeEventiveFestival("frightfest", 2026);

    const low = screenings.find(
      (s) => s.filmTitle === "Special Event - No Film"
    );
    expect(low!.availabilityStatus).toBe("low");
  });

  it("should use still_url as fallback poster", async () => {
    const { screenings } = await scrapeEventiveFestival("frightfest", 2026);

    const nightTerrors = screenings.find(
      (s) => s.filmTitle === "Night Terrors"
    );
    expect(nightTerrors!.posterUrl).toBe(
      "https://cdn.eventive.org/stills/film2.jpg"
    );
  });

  it("should throw for unknown festival slugBase", async () => {
    await expect(
      scrapeEventiveFestival("unknown-fest", 2026)
    ).rejects.toThrow("Unknown Eventive festival: unknown-fest");
  });

  it("should gracefully handle API errors", async () => {
    (discoverEventBucket as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Eventive API error: 503 Service Unavailable")
    );

    await expect(
      scrapeEventiveFestival("frightfest", 2026)
    ).rejects.toThrow("503");
  });
});

describe("scrapeActiveEventiveFestivals venue identity", () => {
  /**
   * The save loop validated with `getCinemaById(cinemaId)`, which resolves
   * legacy aliases and returns the canonical record, then persisted the *raw*
   * mapping key. A legacy ID therefore passed the guard and was written
   * verbatim, which is how a second `cinemas` row gets minted for one venue
   * (see the `nickel` / `the-nickel` split in the 2026-09-08 audit).
   */
  it("saves under the canonical cinema ID when the mapping holds a legacy alias", async () => {
    // FrightFest's watch window is August (typicalMonths [7]); pin the clock so
    // this does not silently stop exercising the loop in another month.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:00:00Z"));

    const frightfest = EVENTIVE_FESTIVALS.find((f) => f.slugBase === "frightfest")!;
    const originalMapping = frightfest.venueMapping["Prince Charles Cinema"];
    // "nickel" is a real legacy alias of the canonical "the-nickel".
    frightfest.venueMapping["Prince Charles Cinema"] = "nickel";

    try {
      vi.mocked(discoverEventBucket).mockResolvedValue("bucket123");
      vi.mocked(getFilms).mockResolvedValue(mockFilms as never);
      vi.mocked(getEvents).mockResolvedValue(mockEvents as never);
      vi.mocked(saveScreenings).mockClear();

      await scrapeActiveEventiveFestivals();

      const savedCinemaIds = vi.mocked(saveScreenings).mock.calls.map((c) => c[0]);
      expect(savedCinemaIds).toContain("the-nickel");
      expect(savedCinemaIds).not.toContain("nickel");
    } finally {
      frightfest.venueMapping["Prince Charles Cinema"] = originalMapping;
      vi.useRealTimers();
    }
  });

  it("reports screenings whose festival link failed after they persisted", async () => {
    // This ingester is the only producer of festivalSlug screenings, so it is
    // the one place a post-write failure can actually occur. It must reach the
    // result rather than be absorbed into the tagged count: the rows are
    // stored, and their link is missing.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:00:00Z"));

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      vi.mocked(discoverEventBucket).mockResolvedValue("bucket123");
      vi.mocked(getFilms).mockResolvedValue(mockFilms as never);
      vi.mocked(getEvents).mockResolvedValue(mockEvents as never);
      vi.mocked(saveScreenings).mockResolvedValue({
        cinemaId: "the-nickel",
        added: 3,
        updated: 0,
        failed: 0,
        rejected: 0,
        rejectedByReason: {},
        accepted: 3,
        write: { upserted: 3, updated: 0, unchanged: 0, failed: 0 },
        postWriteFailures: 2,
        blocked: false,
        scrapedAt: new Date("2026-08-15T12:00:00Z"),
      });

      const results = await scrapeActiveEventiveFestivals();
      const withWrites = results.filter((r) => r.screeningsTagged > 0);

      expect(withWrites.length).toBeGreaterThan(0);
      for (const result of withWrites) {
        // Two per saveScreenings call, so a whole number and never NaN.
        expect(Number.isInteger(result.postWriteFailures)).toBe(true);
        expect(result.postWriteFailures).toBeGreaterThan(0);
        // The rows still count as written — the failure is not a lost write.
        expect(result.screeningsTagged).toBeGreaterThan(0);
      }
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("persisted but their festival link failed"),
      );
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });
});
