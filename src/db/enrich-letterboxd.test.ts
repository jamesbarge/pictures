import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// Mock the DB module so enrichLetterboxdRatings can run without a database.
const mockSelectDistinctWhere = vi.fn();
const mockSelectWhere = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();

vi.mock("./index", () => ({
  db: {
    selectDistinct: vi.fn(() => ({
      from: () => ({
        innerJoin: () => ({
          where: (...args: unknown[]) => mockSelectDistinctWhere(...args),
        }),
      }),
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: (...args: unknown[]) => mockSelectWhere(...args),
      }),
    })),
    update: vi.fn(() => ({
      set: (values: unknown) => {
        mockUpdateSet(values);
        return { where: (...args: unknown[]) => mockUpdateWhere(...args) };
      },
    })),
  },
}));

import {
  buildTitleCandidates,
  enrichLetterboxdRatings,
  isLikelyEvent,
  parseRatingWithVerification,
} from "./enrich-letterboxd";

describe("buildTitleCandidates", () => {
  it("extracts useful variants from noisy programming titles", () => {
    const candidates = buildTitleCandidates("UK PREMIERE MACDO");
    expect(candidates).toContain("MACDO");
  });

  it("keeps short canonical title when alternate title is in parentheses", () => {
    const candidates = buildTitleCandidates(
      "Amelie (Le fabuleux destin d'Amélie Poulain)"
    );

    expect(candidates).toContain("Amelie");
  });

  it("strips partnership suffix", () => {
    const candidates = buildTitleCandidates(
      "My Father's Shadow in association with We Are Parable"
    );

    expect(candidates).toContain("My Father's Shadow");
  });
});

describe("parseRatingWithVerification", () => {
  const baseHtml = `
    <html>
      <head>
        <meta property="og:title" content="Miss Congeniality (2000)" />
        <meta name="twitter:data2" content="3.40 out of 5" />
      </head>
    </html>
  `;

  it("parses valid rating metadata", () => {
    const parsed = parseRatingWithVerification(
      baseHtml,
      "https://letterboxd.com/film/miss-congeniality/",
      2000
    );

    expect(parsed).toEqual({
      rating: 3.4,
      url: "https://letterboxd.com/film/miss-congeniality/",
    });
  });

  it("supports 'out of 5 stars' format", () => {
    const html = baseHtml.replace("3.40 out of 5", "3.40 out of 5 stars");
    const parsed = parseRatingWithVerification(
      html,
      "https://letterboxd.com/film/miss-congeniality/",
      2000
    );

    expect(parsed?.rating).toBe(3.4);
  });

  it("rejects mismatched year", () => {
    const parsed = parseRatingWithVerification(
      baseHtml,
      "https://letterboxd.com/film/miss-congeniality/",
      1990
    );

    expect(parsed).toBeNull();
  });
});

describe("isLikelyEvent", () => {
  it("flags event-style titles", () => {
    expect(isLikelyEvent("Apocalypse Now + Q&A")).toBe(true);
  });

  it("does not flag normal film titles", () => {
    expect(isLikelyEvent("Miss Congeniality")).toBe(false);
  });
});

describe("enrichLetterboxdRatings", () => {
  let mockFetch: Mock;

  function letterboxdPage(title: string, year: number, rating = "3.50 out of 5") {
    return `
      <html>
        <head>
          <meta property="og:title" content="${title} (${year})" />
          <meta name="twitter:data2" content="${rating}" />
        </head>
      </html>
    `;
  }

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    mockSelectDistinctWhere.mockReset();
    mockSelectWhere.mockReset();
    mockUpdateSet.mockReset();
    mockUpdateWhere.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips films without a TMDB anchor and never guesses a slug", async () => {
    // A same-titled famous film exists on Letterboxd, but this row has no
    // TMDB match — the enricher must not even attempt a fetch.
    mockSelectDistinctWhere.mockResolvedValue([
      {
        id: "film-no-anchor",
        title: "Gaza",
        year: null,
        tmdbId: null,
        letterboxdSlug: null,
      },
    ]);

    const result = await enrichLetterboxdRatings(undefined, true);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockUpdateSet).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.enriched).toBe(0);
  });

  it("prefers the stored canonical slug and skips slug-guessing", async () => {
    mockSelectDistinctWhere.mockResolvedValue([
      {
        id: "film-nighthawks",
        title: "Nighthawks",
        year: 1978,
        tmdbId: 84097,
        letterboxdSlug: "nighthawks-1978",
      },
    ]);

    const slugUrl = "https://letterboxd.com/film/nighthawks-1978/";
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      url: slugUrl,
      text: async () => letterboxdPage("Nighthawks", 1978, "3.80 out of 5"),
    });

    const result = await enrichLetterboxdRatings(undefined, true);

    // Exactly one fetch, straight to the stored slug — no guessed URLs
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(slugUrl);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        letterboxdRating: 3.8,
        letterboxdUrl: slugUrl,
        letterboxdSlug: "nighthawks-1978",
        letterboxdEnrichedAt: expect.any(Date),
      }),
    );
    expect(result.enriched).toBe(1);
  });

  it("never downgrades a stored watchlist slug when Letterboxd redirects", async () => {
    mockSelectDistinctWhere.mockResolvedValue([
      {
        id: "film-nighthawks",
        title: "Nighthawks",
        year: 1978,
        tmdbId: 84097,
        letterboxdSlug: "nighthawks-1978",
      },
    ]);

    // Letterboxd redirects the year-qualified slug to a plain one; the
    // stored watchlist slug is higher-trust and must be kept.
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://letterboxd.com/film/nighthawks/",
      text: async () => letterboxdPage("Nighthawks", 1978, "3.80 out of 5"),
    });

    await enrichLetterboxdRatings(undefined, true);

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        letterboxdUrl: "https://letterboxd.com/film/nighthawks/",
        letterboxdSlug: "nighthawks-1978",
      }),
    );
  });

  it("persists the canonical slug from the post-redirect URL", async () => {
    mockSelectDistinctWhere.mockResolvedValue([
      {
        id: "film-paprika",
        title: "Paprika",
        year: 2006,
        tmdbId: 4977,
        letterboxdSlug: null,
      },
    ]);

    // Letterboxd redirects the year-suffixed guess to its canonical slug;
    // undici exposes the final URL on response.url.
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://letterboxd.com/film/paprika-2006/",
      text: async () => letterboxdPage("Paprika", 2006, "4.10 out of 5"),
    });

    const result = await enrichLetterboxdRatings(undefined, true);

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        letterboxdUrl: "https://letterboxd.com/film/paprika-2006/",
        letterboxdSlug: "paprika-2006",
        letterboxdEnrichedAt: expect.any(Date),
      }),
    );
    expect(result.enriched).toBe(1);
  });
});
