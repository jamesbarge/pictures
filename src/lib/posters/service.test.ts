import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression cover for the "wrong poster on the wrong film" bug.
 *
 * `tryTMDBSearch` used to take the first `/search/movie` hit for a film with no
 * TMDB id. TMDB orders those by popularity, so "The Birds" got *The Angry Birds
 * Movie*, "The Silence" got *The Silence of the Lambs*, and a Tarkovsky 4K
 * restoration got *Gumby* — all observed in production. Since this path only
 * runs when the identity matcher has already declined the title, the raw search
 * was overruling the very guards that had just rejected it.
 */

const matchFilmToTMDB = vi.fn();
const searchFilms = vi.fn();
const getFilmDetails = vi.fn();
const classifyContentCached = vi.fn();
const isImageAccessible = vi.fn();

vi.mock("@/lib/tmdb", () => ({
  getTMDBClient: () => ({ searchFilms, getFilmDetails }),
  matchFilmToTMDB: (...args: unknown[]) => matchFilmToTMDB(...args),
}));

vi.mock("@/lib/content-classifier", () => ({
  classifyContentCached: (...args: unknown[]) => classifyContentCached(...args),
}));

vi.mock("@/lib/image-processor", () => ({
  isImageAccessible: (...args: unknown[]) => isImageAccessible(...args),
}));

vi.mock("./omdb", () => ({
  getOMDBClient: () => ({ isConfigured: () => false }),
}));

vi.mock("./fanart", () => ({
  getFanartClient: () => ({ isConfigured: () => false }),
}));

import { PosterService } from "./service";

describe("PosterService.findPoster — films with no TMDB id", () => {
  let service: PosterService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: the classifier finds nothing better than the title it was given.
    classifyContentCached.mockImplementation(async (t: string) => ({
      cleanTitle: t,
      confidence: "low",
    }));
    isImageAccessible.mockResolvedValue(true);
    service = new PosterService();
  });

  it("never falls back to an unverified TMDB search when the matcher declines", async () => {
    matchFilmToTMDB.mockResolvedValue(null);

    const result = await service.findPoster({ title: "The Birds", contentType: "film" });

    // The whole point: no raw search, so no popularity-ranked stranger's poster.
    expect(searchFilms).not.toHaveBeenCalled();
    expect(result.source).toBe("placeholder");
  });

  it("uses the poster of an identity-verified match", async () => {
    matchFilmToTMDB.mockResolvedValue({
      tmdbId: 578,
      confidence: 0.91,
      title: "The Birds",
      year: 1963,
      posterPath: "/jVvBgKKZjmqCcO4crP9uOnb2yPu.jpg",
    });

    const result = await service.findPoster({ title: "The Birds", year: 1963, contentType: "film" });

    expect(matchFilmToTMDB).toHaveBeenCalledWith("The Birds", {
      year: 1963,
      director: undefined,
    });
    expect(result.source).toBe("tmdb");
    expect(result.url).toBe("https://image.tmdb.org/t/p/w500/jVvBgKKZjmqCcO4crP9uOnb2yPu.jpg");
  });

  it("passes the director hint through — ambiguous titles need it to match at all", async () => {
    matchFilmToTMDB.mockResolvedValue(null);

    await service.findPoster({
      title: "Ten",
      year: 2002,
      director: "Abbas Kiarostami",
      contentType: "film",
    });

    expect(matchFilmToTMDB).toHaveBeenCalledWith("Ten", {
      year: 2002,
      director: "Abbas Kiarostami",
    });
  });

  it("falls through when a verified match has no poster of its own", async () => {
    matchFilmToTMDB.mockResolvedValue({
      tmdbId: 1234,
      confidence: 0.9,
      title: "An Obscure Short",
      year: 1974,
      posterPath: null,
    });

    const result = await service.findPoster({ title: "An Obscure Short", contentType: "film" });

    // Must not emit ".../w500null"
    expect(result.url).not.toContain("null");
    expect(result.source).toBe("placeholder");
  });

  it("prefers the cinema's own artwork over a placeholder when the matcher declines", async () => {
    matchFilmToTMDB.mockResolvedValue(null);

    const result = await service.findPoster({
      title: "Camp Miasma Mystery Movie Marathon",
      contentType: "film",
      scraperPosterUrl: "https://cinema.example/artwork.jpg",
    });

    expect(result.source).toBe("scraper");
    expect(result.url).toBe("https://cinema.example/artwork.jpg");
  });

  it("re-verifies the classifier's cleaned title instead of trusting it", async () => {
    matchFilmToTMDB.mockResolvedValueOnce(null).mockResolvedValueOnce({
      tmdbId: 599,
      confidence: 0.88,
      title: "Sunset Boulevard",
      year: 1950,
      posterPath: "/sunset.jpg",
    });
    classifyContentCached.mockResolvedValue({
      cleanTitle: "Sunset Boulevard",
      confidence: "high",
    });

    const result = await service.findPoster({
      title: "Classic Matinee: Sunset Boulevard",
      contentType: "film",
    });

    expect(matchFilmToTMDB).toHaveBeenNthCalledWith(2, "Sunset Boulevard", {
      year: undefined,
      director: undefined,
    });
    expect(searchFilms).not.toHaveBeenCalled();
    expect(result.url).toBe("https://image.tmdb.org/t/p/w500/sunset.jpg");
  });
});
