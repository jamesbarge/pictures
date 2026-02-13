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

// Mock the pipeline (don't actually save to DB)
vi.mock("@/scrapers/pipeline", () => ({
  saveScreenings: vi.fn().mockResolvedValue({ added: 0, updated: 0, failed: 0 }),
}));

import { scrapeEventiveFestival, EVENTIVE_FESTIVALS } from "./eventive-scraper";
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
