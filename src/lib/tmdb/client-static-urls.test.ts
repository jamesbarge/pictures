/**
 * Tests for the static URL-builder methods on TMDBClient.
 *
 * The rest of TMDBClient is async + DI-bound (real HTTP calls to TMDB).
 * The static URL builders are pure string concatenation and benefit from
 * tests independently.
 */
import { describe, expect, it, vi } from "vitest";
import { TMDBClient } from "./client";

describe("TMDBClient.getPosterUrl", () => {
  it("returns null for null input", () => {
    expect(TMDBClient.getPosterUrl(null)).toBeNull();
  });

  it("builds a TMDB image CDN URL with default size w342", () => {
    const url = TMDBClient.getPosterUrl("/abc.jpg");
    expect(url).toMatch(/^https:\/\/image\.tmdb\.org\/t\/p\/w342\/abc\.jpg$/);
  });

  it("respects an explicit size override", () => {
    const url = TMDBClient.getPosterUrl("/abc.jpg", "w500");
    expect(url).toContain("/w500/");
  });

  it("supports the 'original' size", () => {
    const url = TMDBClient.getPosterUrl("/abc.jpg", "original");
    expect(url).toContain("/original/");
  });

  it("does NOT add a slash between size and posterPath (caller's leading slash is preserved)", () => {
    const url = TMDBClient.getPosterUrl("/abc.jpg", "w92");
    expect(url).toBe("https://image.tmdb.org/t/p/w92/abc.jpg");
    // Not "/w92//abc.jpg" — the implementation does `${size}${posterPath}`.
  });
});

describe("TMDBClient.getBackdropUrl", () => {
  it("returns null for null input", () => {
    expect(TMDBClient.getBackdropUrl(null)).toBeNull();
  });

  it("builds a TMDB image CDN URL with default size w780", () => {
    const url = TMDBClient.getBackdropUrl("/bg.jpg");
    expect(url).toMatch(/^https:\/\/image\.tmdb\.org\/t\/p\/w780\/bg\.jpg$/);
  });

  it("respects an explicit size override (w300/w780/w1280/original)", () => {
    expect(TMDBClient.getBackdropUrl("/bg.jpg", "w300")).toContain("/w300/");
    expect(TMDBClient.getBackdropUrl("/bg.jpg", "w1280")).toContain("/w1280/");
    expect(TMDBClient.getBackdropUrl("/bg.jpg", "original")).toContain("/original/");
  });
});

describe("TMDBClient.getProfileUrl", () => {
  it("returns null for null input", () => {
    expect(TMDBClient.getProfileUrl(null)).toBeNull();
  });

  it("builds a TMDB image CDN URL with default size w185", () => {
    const url = TMDBClient.getProfileUrl("/p.jpg");
    expect(url).toMatch(/^https:\/\/image\.tmdb\.org\/t\/p\/w185\/p\.jpg$/);
  });

  it("supports the h632 height-anchored size", () => {
    // Person profiles use a height-based size (h632) which is unusual —
    // pin it so a refactor that drops the union member is caught.
    expect(TMDBClient.getProfileUrl("/p.jpg", "h632")).toContain("/h632/");
  });
});

describe("TMDBClient.getFullFilmData — prefetched details reuse (plan 006 follow-up)", () => {
  function makeDetails(id: number) {
    return { id, runtime: 97, title: "Joyland" } as unknown as import("./types").TMDBMovieDetails;
  }

  function stubClient() {
    const client = new TMDBClient("test-key");
    const getFilmDetails = vi
      .spyOn(client, "getFilmDetails")
      .mockResolvedValue(makeDetails(11));
    vi.spyOn(client, "getFilmCredits").mockResolvedValue({ cast: [], crew: [] } as never);
    vi.spyOn(client, "getUKCertification").mockResolvedValue(null);
    return { client, getFilmDetails };
  }

  it("skips the details fetch when prefetched details match the tmdbId", async () => {
    const { client, getFilmDetails } = stubClient();
    const prefetched = makeDetails(11);

    const result = await client.getFullFilmData(11, prefetched);

    expect(getFilmDetails).not.toHaveBeenCalled();
    expect(result.details).toBe(prefetched);
  });

  it("refetches when prefetched details belong to a different tmdbId", async () => {
    const { client, getFilmDetails } = stubClient();

    const result = await client.getFullFilmData(11, makeDetails(99));

    expect(getFilmDetails).toHaveBeenCalledWith(11);
    expect(result.details.id).toBe(11);
  });

  it("fetches normally when no prefetched details are provided", async () => {
    const { client, getFilmDetails } = stubClient();

    await client.getFullFilmData(11);

    expect(getFilmDetails).toHaveBeenCalledWith(11);
  });
});
