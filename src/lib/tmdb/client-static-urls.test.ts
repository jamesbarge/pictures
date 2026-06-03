/**
 * Tests for the static URL-builder methods on TMDBClient.
 *
 * The rest of TMDBClient is async + DI-bound (real HTTP calls to TMDB).
 * The static URL builders are pure string concatenation and benefit from
 * tests independently.
 */
import { describe, expect, it } from "vitest";
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
