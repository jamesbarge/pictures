/**
 * Unit tests for Letterboxd Import Library
 *
 * Tests cover:
 * - normalizeTitle: pure function title normalization
 * - scrapeLetterboxdWatchlist: HTML scraping with mocked fetch
 * - matchAndEnrich: DB matching with mocked Drizzle queries
 * - getOrCreateImportResults: in-memory cache behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before the import of the module under test
// ---------------------------------------------------------------------------

// Mock the DB module
const mockDbSelect = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

// Mock drizzle-orm operators to return identifiable sentinel values
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ _op: "eq", args })),
  gte: vi.fn((...args: unknown[]) => ({ _op: "gte", args })),
  and: vi.fn((...args: unknown[]) => ({ _op: "and", args })),
  or: vi.fn((...args: unknown[]) => ({ _op: "or", args })),
  isNull: vi.fn((...args: unknown[]) => ({ _op: "isNull", args })),
  inArray: vi.fn((...args: unknown[]) => ({ _op: "inArray", args })),
}));

// Mock cheerio is NOT needed — we use the real cheerio to parse fixture HTML

import {
  normalizeTitle,
  scrapeLetterboxdWatchlist,
  matchAndEnrich,
  getOrCreateImportResults,
  LetterboxdImportError,
  type LetterboxdEntry,
} from "./letterboxd-import";

// ---------------------------------------------------------------------------
// HTML Fixture Helpers
// ---------------------------------------------------------------------------

function makeFilmPoster(opts: {
  id: string;
  slug: string;
  name: string;
  year?: number;
}): string {
  const yearAttr = opts.year
    ? `data-film-release-year="${opts.year}"`
    : "";
  return `
    <li class="poster-container">
      <div class="film-poster"
           data-film-id="${opts.id}"
           data-film-slug="${opts.slug}"
           data-film-name="${opts.name}"
           ${yearAttr}>
        <img alt="${opts.name}" src="https://a.ltrbxd.com/resized/${opts.slug}.jpg">
      </div>
    </li>`;
}

function makeWatchlistPage(
  films: Array<{ id: string; slug: string; name: string; year?: number }>,
  opts?: { nextPageUrl?: string; bodyExtra?: string },
): string {
  const posters = films.map(makeFilmPoster).join("\n");
  const pagination = opts?.nextPageUrl
    ? `<div class="paginate-nextprev"><a class="next" href="${opts.nextPageUrl}">Next</a></div>`
    : "";
  const bodyExtra = opts?.bodyExtra ?? "";
  return `
    <html>
      <body>
        <ul class="poster-list">
          ${posters}
        </ul>
        ${pagination}
        ${bodyExtra}
      </body>
    </html>`;
}

function makeEmptyPage(bodyExtra?: string): string {
  return `
    <html>
      <body>
        <ul class="poster-list"></ul>
        ${bodyExtra ?? ""}
      </body>
    </html>`;
}

// ---------------------------------------------------------------------------
// Test: normalizeTitle
// ---------------------------------------------------------------------------

describe("normalizeTitle", () => {
  it("lowercases and trims", () => {
    expect(normalizeTitle("  Hello World  ")).toBe("hello world");
  });

  it("strips leading 'the'", () => {
    expect(normalizeTitle("The Godfather")).toBe("godfather");
  });

  it("removes parenthetical suffixes", () => {
    expect(normalizeTitle("Blade Runner (Final Cut)")).toBe("blade runner");
  });

  it("strips smart quotes (they are non-word characters)", () => {
    // The source regex replaces '' (both regular apostrophes) — smart quotes
    // are NOT matched by the replacement, so they get stripped by the
    // [^\w\s'-] removal pass.
    expect(normalizeTitle("It\u2019s a Wonderful Life")).toBe("its a wonderful life");
    expect(normalizeTitle("\u201CHello\u201D")).toBe("hello");
  });

  it("normalizes en-dash and em-dash to hyphen", () => {
    expect(normalizeTitle("Spider\u2013Man")).toBe("spider-man");
    expect(normalizeTitle("Spider\u2014Man")).toBe("spider-man");
  });

  it("removes special characters except word chars, spaces, apostrophes, hyphens", () => {
    expect(normalizeTitle("Am\u00E9lie!")).toBe("amlie");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeTitle("La   La   Land")).toBe("la la land");
  });

  it("handles empty string", () => {
    expect(normalizeTitle("")).toBe("");
  });

  it("keeps bare 'the' when no trailing space (regex requires ^the\\s+)", () => {
    // The strip-"the" regex is /^the\s+/i which requires whitespace after "the"
    // So bare "The" is not stripped, and after lowercase becomes "the"
    expect(normalizeTitle("The")).toBe("the");
  });

  it("does not strip 'the' from the middle of a title", () => {
    expect(normalizeTitle("Into the Wild")).toBe("into the wild");
  });

  it("preserves straight apostrophes", () => {
    expect(normalizeTitle("it's")).toBe("it's");
  });

  it("preserves hyphens", () => {
    expect(normalizeTitle("Spider-Man")).toBe("spider-man");
  });
});

// ---------------------------------------------------------------------------
// Test: scrapeLetterboxdWatchlist
// ---------------------------------------------------------------------------

describe("scrapeLetterboxdWatchlist", () => {
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  it("parses a normal watchlist page correctly", async () => {
    const html = makeWatchlistPage([
      { id: "123", slug: "the-substance", name: "The Substance", year: 2024 },
      { id: "456", slug: "anora", name: "Anora", year: 2024 },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => html,
    });

    const entries = await scrapeLetterboxdWatchlist("testuser");

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      title: "The Substance",
      year: 2024,
      letterboxdSlug: "the-substance",
      letterboxdId: "123",
    });
    expect(entries[1]).toEqual({
      title: "Anora",
      year: 2024,
      letterboxdSlug: "anora",
      letterboxdId: "456",
    });

    // Verify fetch was called with correct URL and headers
    expect(mockFetch).toHaveBeenCalledWith(
      "https://letterboxd.com/testuser/watchlist/",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "pictures.london/1.0",
        }),
      }),
    );
  });

  it("parses entries without a year", async () => {
    const html = makeWatchlistPage([
      { id: "789", slug: "nosferatu", name: "Nosferatu" },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => html,
    });

    const entries = await scrapeLetterboxdWatchlist("testuser");

    expect(entries).toHaveLength(1);
    expect(entries[0].year).toBeNull();
    expect(entries[0].title).toBe("Nosferatu");
  });

  it("follows pagination across multiple pages", async () => {
    vi.useFakeTimers();

    const page1 = makeWatchlistPage(
      [{ id: "1", slug: "film-a", name: "Film A", year: 2020 }],
      { nextPageUrl: "/testuser/watchlist/page/2/" },
    );
    const page2 = makeWatchlistPage([
      { id: "2", slug: "film-b", name: "Film B", year: 2021 },
    ]);

    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => page1 })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => page2 });

    const promise = scrapeLetterboxdWatchlist("testuser");

    // Advance past the sleep(1000) between pages
    await vi.advanceTimersByTimeAsync(2000);

    const entries = await promise;

    expect(entries).toHaveLength(2);
    expect(entries[0].title).toBe("Film A");
    expect(entries[1].title).toBe("Film B");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("throws user_not_found on 404 response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    });

    try {
      await scrapeLetterboxdWatchlist("nonexistent");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LetterboxdImportError);
      expect((err as LetterboxdImportError).code).toBe("user_not_found");
    }
  });

  it("throws rate_limited on 429 response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Too Many Requests",
    });

    try {
      await scrapeLetterboxdWatchlist("testuser");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LetterboxdImportError);
      expect((err as LetterboxdImportError).code).toBe("rate_limited");
    }
  });

  it("throws rate_limited on 503 response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    });

    try {
      await scrapeLetterboxdWatchlist("testuser");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LetterboxdImportError);
      expect((err as LetterboxdImportError).code).toBe("rate_limited");
    }
  });

  it("throws private_watchlist when page is empty with private indicator text", async () => {
    const html = makeEmptyPage(
      "<p>This watchlist is not public.</p>",
    );

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    });

    try {
      await scrapeLetterboxdWatchlist("privateuser");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LetterboxdImportError);
      expect((err as LetterboxdImportError).code).toBe("private_watchlist");
    }
  });

  it("throws private_watchlist when page has a .private-list element", async () => {
    const html = makeEmptyPage(
      '<div class="private-list">Private</div>',
    );

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    });

    try {
      await scrapeLetterboxdWatchlist("privateuser2");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LetterboxdImportError);
      expect((err as LetterboxdImportError).code).toBe("private_watchlist");
    }
  });

  it("throws empty_watchlist when page is empty without private indicators", async () => {
    const html = makeEmptyPage();

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    });

    try {
      await scrapeLetterboxdWatchlist("emptyuser");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LetterboxdImportError);
      expect((err as LetterboxdImportError).code).toBe("empty_watchlist");
    }
  });

  it("throws user_not_found for invalid username with special characters", async () => {
    try {
      await scrapeLetterboxdWatchlist("user@invalid!");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LetterboxdImportError);
      expect((err as LetterboxdImportError).code).toBe("user_not_found");
    }
  });

  it("throws user_not_found for username longer than 40 characters", async () => {
    const longUsername = "a".repeat(41);
    try {
      await scrapeLetterboxdWatchlist(longUsername);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LetterboxdImportError);
      expect((err as LetterboxdImportError).code).toBe("user_not_found");
    }
  });

  it("caps entries at 500", async () => {
    vi.useFakeTimers();

    // Generate a single page with 501 entries
    const manyFilms = Array.from({ length: 501 }, (_, i) => ({
      id: String(i),
      slug: `film-${i}`,
      name: `Film ${i}`,
      year: 2020,
    }));

    const html = makeWatchlistPage(manyFilms);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => html,
    });

    const entries = await scrapeLetterboxdWatchlist("biglist");

    expect(entries).toHaveLength(500);

    vi.useRealTimers();
  });

  it("throws network_error when fetch rejects", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    try {
      await scrapeLetterboxdWatchlist("testuser");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LetterboxdImportError);
      expect((err as LetterboxdImportError).code).toBe("network_error");
    }
  });

  it("throws network_error for non-standard HTTP error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    try {
      await scrapeLetterboxdWatchlist("testuser");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LetterboxdImportError);
      expect((err as LetterboxdImportError).code).toBe("network_error");
    }
  });
});

// ---------------------------------------------------------------------------
// Test: matchAndEnrich
// ---------------------------------------------------------------------------

describe("matchAndEnrich", () => {
  // Helper to set up the chained DB mock for films query
  function setupFilmsQuery(
    filmResults: Array<{
      id: string;
      title: string;
      year: number | null;
      directors: string[];
      posterUrl: string | null;
    }>,
  ) {
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(filmResults),
      }),
    };
  }

  // Helper to set up the chained DB mock for screenings query
  function setupScreeningsQuery(
    screeningResults: Array<{
      id: string;
      filmId: string;
      datetime: Date;
      format: string | null;
      isSpecialEvent: boolean;
      eventDescription: string | null;
      cinema: { id: string; name: string; shortName: string | null };
    }>,
  ) {
    return {
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(screeningResults),
            }),
          }),
        }),
      }),
    };
  }

  beforeEach(() => {
    mockDbSelect.mockReset();
  });

  it("returns empty arrays for empty entries", async () => {
    const result = await matchAndEnrich([]);
    expect(result).toEqual({ matched: [], unmatched: [] });
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("matches by exact normalized title with same year", async () => {
    const filmsChain = setupFilmsQuery([
      {
        id: "film-1",
        title: "The Substance",
        year: 2024,
        directors: ["Coralie Fargeat"],
        posterUrl: "https://img.tmdb.org/substance.jpg",
      },
    ]);

    const screeningsChain = setupScreeningsQuery([
      {
        id: "scr-1",
        filmId: "film-1",
        datetime: new Date("2026-04-01T19:00:00Z"),
        format: "35mm",
        isSpecialEvent: false,
        eventDescription: null,
        cinema: { id: "bfi", name: "BFI Southbank", shortName: "BFI" },
      },
      {
        id: "scr-2",
        filmId: "film-1",
        datetime: new Date("2026-04-05T20:00:00Z"),
        format: null,
        isSpecialEvent: true,
        eventDescription: "Director Q&A",
        cinema: { id: "curzon", name: "Curzon Soho", shortName: null },
      },
    ]);

    mockDbSelect
      .mockReturnValueOnce(filmsChain)
      .mockReturnValueOnce(screeningsChain);

    const entries: LetterboxdEntry[] = [
      {
        title: "The Substance",
        year: 2024,
        letterboxdSlug: "the-substance",
        letterboxdId: "123",
      },
    ];

    const result = await matchAndEnrich(entries);

    expect(result.matched).toHaveLength(1);
    expect(result.unmatched).toHaveLength(0);

    const film = result.matched[0];
    expect(film.filmId).toBe("film-1");
    expect(film.title).toBe("The Substance");
    expect(film.year).toBe(2024);
    expect(film.directors).toEqual(["Coralie Fargeat"]);
    expect(film.screenings.count).toBe(2);
    expect(film.screenings.isLastChance).toBe(true); // count <= 2
    expect(film.screenings.next).toEqual({
      datetime: "2026-04-01T19:00:00.000Z",
      cinemaName: "BFI", // shortName preferred
      format: "35mm",
      isSpecialEvent: false,
      eventDescription: null,
    });
  });

  it("matches with year +/-1 tolerance", async () => {
    const filmsChain = setupFilmsQuery([
      {
        id: "film-2",
        title: "Anora",
        year: 2024, // DB has 2024
        directors: ["Sean Baker"],
        posterUrl: null,
      },
    ]);

    const screeningsChain = setupScreeningsQuery([]);

    mockDbSelect
      .mockReturnValueOnce(filmsChain)
      .mockReturnValueOnce(screeningsChain);

    const entries: LetterboxdEntry[] = [
      {
        title: "Anora",
        year: 2025, // Letterboxd says 2025 -- within +/-1
        letterboxdSlug: "anora",
        letterboxdId: "456",
      },
    ];

    const result = await matchAndEnrich(entries);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].filmId).toBe("film-2");
  });

  it("matches when entry has no year and there is a single candidate", async () => {
    const filmsChain = setupFilmsQuery([
      {
        id: "film-3",
        title: "Nosferatu",
        year: 2024,
        directors: ["Robert Eggers"],
        posterUrl: null,
      },
    ]);

    const screeningsChain = setupScreeningsQuery([]);

    mockDbSelect
      .mockReturnValueOnce(filmsChain)
      .mockReturnValueOnce(screeningsChain);

    const entries: LetterboxdEntry[] = [
      {
        title: "Nosferatu",
        year: null,
        letterboxdSlug: "nosferatu-2024",
        letterboxdId: "789",
      },
    ];

    const result = await matchAndEnrich(entries);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].filmId).toBe("film-3");
  });

  it("takes first candidate when entry has no year and multiple candidates", async () => {
    const filmsChain = setupFilmsQuery([
      {
        id: "film-nosf-1922",
        title: "Nosferatu",
        year: 1922,
        directors: ["F.W. Murnau"],
        posterUrl: null,
      },
      {
        id: "film-nosf-2024",
        title: "Nosferatu",
        year: 2024,
        directors: ["Robert Eggers"],
        posterUrl: null,
      },
    ]);

    const screeningsChain = setupScreeningsQuery([]);

    mockDbSelect
      .mockReturnValueOnce(filmsChain)
      .mockReturnValueOnce(screeningsChain);

    const entries: LetterboxdEntry[] = [
      {
        title: "Nosferatu",
        year: null,
        letterboxdSlug: "nosferatu",
        letterboxdId: "111",
      },
    ];

    const result = await matchAndEnrich(entries);

    // No year + multiple candidates -> takes first
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].filmId).toBe("film-nosf-1922");
  });

  it("marks entry unmatched when year has no match among multiple candidates", async () => {
    const filmsChain = setupFilmsQuery([
      {
        id: "film-a",
        title: "Dune",
        year: 1984,
        directors: ["David Lynch"],
        posterUrl: null,
      },
      {
        id: "film-b",
        title: "Dune",
        year: 2021,
        directors: ["Denis Villeneuve"],
        posterUrl: null,
      },
    ]);

    mockDbSelect.mockReturnValueOnce(filmsChain);

    const entries: LetterboxdEntry[] = [
      {
        title: "Dune",
        year: 2000, // Neither 1984 nor 2021, not within +/-1
        letterboxdSlug: "dune-2000",
        letterboxdId: "222",
      },
    ];

    const result = await matchAndEnrich(entries);

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].letterboxdId).toBe("222");
  });

  it("marks entry unmatched when title has no match in DB", async () => {
    const filmsChain = setupFilmsQuery([
      {
        id: "film-x",
        title: "Existing Film",
        year: 2023,
        directors: ["Someone"],
        posterUrl: null,
      },
    ]);

    mockDbSelect.mockReturnValueOnce(filmsChain);

    const entries: LetterboxdEntry[] = [
      {
        title: "Nonexistent Film",
        year: 2023,
        letterboxdSlug: "nonexistent",
        letterboxdId: "333",
      },
    ];

    const result = await matchAndEnrich(entries);

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
  });

  it("enriches with screening data: count, next, isLastChance", async () => {
    const filmsChain = setupFilmsQuery([
      {
        id: "film-10",
        title: "Mulholland Drive",
        year: 2001,
        directors: ["David Lynch"],
        posterUrl: "https://img.tmdb.org/mulholland.jpg",
      },
    ]);

    // 3 screenings -- isLastChance should be false (count > 2)
    const screeningsChain = setupScreeningsQuery([
      {
        id: "scr-a",
        filmId: "film-10",
        datetime: new Date("2026-03-10T18:00:00Z"),
        format: "DCP",
        isSpecialEvent: false,
        eventDescription: null,
        cinema: { id: "prince-charles", name: "Prince Charles Cinema", shortName: "PCC" },
      },
      {
        id: "scr-b",
        filmId: "film-10",
        datetime: new Date("2026-03-15T20:30:00Z"),
        format: null,
        isSpecialEvent: false,
        eventDescription: null,
        cinema: { id: "bfi", name: "BFI Southbank", shortName: "BFI" },
      },
      {
        id: "scr-c",
        filmId: "film-10",
        datetime: new Date("2026-03-20T14:00:00Z"),
        format: "35mm",
        isSpecialEvent: true,
        eventDescription: "Introduced by the director",
        cinema: { id: "ica", name: "ICA Cinema", shortName: "ICA" },
      },
    ]);

    mockDbSelect
      .mockReturnValueOnce(filmsChain)
      .mockReturnValueOnce(screeningsChain);

    const entries: LetterboxdEntry[] = [
      {
        title: "Mulholland Drive",
        year: 2001,
        letterboxdSlug: "mulholland-drive",
        letterboxdId: "444",
      },
    ];

    const result = await matchAndEnrich(entries);

    const film = result.matched[0];
    expect(film.screenings.count).toBe(3);
    expect(film.screenings.isLastChance).toBe(false); // 3 > 2
    expect(film.screenings.next!.datetime).toBe("2026-03-10T18:00:00.000Z");
    expect(film.screenings.next!.cinemaName).toBe("PCC");
    expect(film.screenings.next!.format).toBe("DCP");
  });

  it("handles film with no upcoming screenings", async () => {
    const filmsChain = setupFilmsQuery([
      {
        id: "film-20",
        title: "Lost Highway",
        year: 1997,
        directors: ["David Lynch"],
        posterUrl: null,
      },
    ]);

    const screeningsChain = setupScreeningsQuery([]); // No screenings

    mockDbSelect
      .mockReturnValueOnce(filmsChain)
      .mockReturnValueOnce(screeningsChain);

    const entries: LetterboxdEntry[] = [
      {
        title: "Lost Highway",
        year: 1997,
        letterboxdSlug: "lost-highway",
        letterboxdId: "555",
      },
    ];

    const result = await matchAndEnrich(entries);

    const film = result.matched[0];
    expect(film.screenings.count).toBe(0);
    expect(film.screenings.next).toBeNull();
    // isLastChance: count > 0 && count <= 2 => false when count is 0
    expect(film.screenings.isLastChance).toBe(false);
  });

  it("uses cinema shortName when available, falls back to name", async () => {
    const filmsChain = setupFilmsQuery([
      {
        id: "film-30",
        title: "Blue Velvet",
        year: 1986,
        directors: ["David Lynch"],
        posterUrl: null,
      },
    ]);

    const screeningsChain = setupScreeningsQuery([
      {
        id: "scr-bv",
        filmId: "film-30",
        datetime: new Date("2026-05-01T19:00:00Z"),
        format: null,
        isSpecialEvent: false,
        eventDescription: null,
        cinema: { id: "rio", name: "Rio Cinema Dalston", shortName: null },
      },
    ]);

    mockDbSelect
      .mockReturnValueOnce(filmsChain)
      .mockReturnValueOnce(screeningsChain);

    const entries: LetterboxdEntry[] = [
      {
        title: "Blue Velvet",
        year: 1986,
        letterboxdSlug: "blue-velvet",
        letterboxdId: "666",
      },
    ];

    const result = await matchAndEnrich(entries);

    expect(result.matched[0].screenings.next!.cinemaName).toBe(
      "Rio Cinema Dalston",
    );
  });

  it("deduplicates matched films by filmId", async () => {
    const filmsChain = setupFilmsQuery([
      {
        id: "film-dup",
        title: "Eraserhead",
        year: 1977,
        directors: ["David Lynch"],
        posterUrl: null,
      },
    ]);

    const screeningsChain = setupScreeningsQuery([]);

    mockDbSelect
      .mockReturnValueOnce(filmsChain)
      .mockReturnValueOnce(screeningsChain);

    const entries: LetterboxdEntry[] = [
      {
        title: "Eraserhead",
        year: 1977,
        letterboxdSlug: "eraserhead",
        letterboxdId: "e1",
      },
      {
        title: "Eraserhead",
        year: 1978, // Within +/-1
        letterboxdSlug: "eraserhead-2",
        letterboxdId: "e2",
      },
    ];

    const result = await matchAndEnrich(entries);

    // Both match film-dup, but dedup means only one enriched film
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].filmId).toBe("film-dup");
  });
});

// ---------------------------------------------------------------------------
// Test: getOrCreateImportResults (cache behavior)
// ---------------------------------------------------------------------------

describe("getOrCreateImportResults", () => {
  let mockFetch: Mock;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    mockDbSelect.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setupMocksForScrapeAndMatch() {
    const html = makeWatchlistPage([
      { id: "c1", slug: "conclave", name: "Conclave", year: 2024 },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => html,
    });

    const filmsChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            id: "film-conclave",
            title: "Conclave",
            year: 2024,
            directors: ["Edward Berger"],
            posterUrl: null,
          },
        ]),
      }),
    };

    const screeningsChain = {
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    };

    mockDbSelect
      .mockReturnValueOnce(filmsChain)
      .mockReturnValueOnce(screeningsChain);
  }

  it("calls scrape + match on cache miss", async () => {
    setupMocksForScrapeAndMatch();

    const result = await getOrCreateImportResults("cachetest");

    expect(result.username).toBe("cachetest");
    expect(result.total).toBe(1);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].title).toBe("Conclave");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns cached results on cache hit", async () => {
    setupMocksForScrapeAndMatch();

    // First call populates cache
    const result1 = await getOrCreateImportResults("cacheuser");

    // Reset mocks
    mockFetch.mockReset();
    mockDbSelect.mockReset();

    // Second call should hit cache
    const result2 = await getOrCreateImportResults("cacheuser");

    expect(result2).toEqual(result1);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("cache key is case-insensitive", async () => {
    setupMocksForScrapeAndMatch();

    await getOrCreateImportResults("CaseUser");

    mockFetch.mockReset();
    mockDbSelect.mockReset();

    // Different case should still hit cache
    const result = await getOrCreateImportResults("caseuser");

    expect(result.username).toBe("CaseUser");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("re-fetches when cache has expired", async () => {
    setupMocksForScrapeAndMatch();

    // First call populates cache
    await getOrCreateImportResults("expiretest");

    // Advance time past the 1-hour TTL
    vi.advanceTimersByTime(61 * 60 * 1000);

    // Reset mocks so we can cleanly track the re-fetch
    mockFetch.mockReset();
    mockDbSelect.mockReset();

    // Set up mocks again for the re-fetch
    setupMocksForScrapeAndMatch();

    const result = await getOrCreateImportResults("expiretest");

    // fetch was called again (cache expired)
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test: LetterboxdImportError
// ---------------------------------------------------------------------------

describe("LetterboxdImportError", () => {
  it("sets name, code, and message correctly", () => {
    const err = new LetterboxdImportError("rate_limited", "Slow down");
    expect(err.name).toBe("LetterboxdImportError");
    expect(err.code).toBe("rate_limited");
    expect(err.message).toBe("Slow down");
  });

  it("uses code as default message when none provided", () => {
    const err = new LetterboxdImportError("network_error");
    expect(err.message).toBe("network_error");
  });

  it("is an instance of Error", () => {
    const err = new LetterboxdImportError("user_not_found");
    expect(err).toBeInstanceOf(Error);
  });
});
