/**
 * Sequel safety at the two seams the pipeline actually calls.
 *
 * `getOrCreateFilm` tries three things in order: an exact normalized cache
 * lookup, `findFilmBySimilarity`, then TMDB. The 2026-09-09 run's 36 accepted
 * "Practical Magic 2" matches all resolved at the second one, so this file
 * pins both of the first two:
 *
 *   1. the cache path cannot collide a sequel with its base title, because the
 *      production normalizer preserves the instalment marker — asserted here
 *      rather than assumed from reading the cleaner's regexes;
 *   2. `findFilmBySimilarity` propagates the guard's refusal instead of
 *      swallowing it, so the pipeline falls through to TMDB.
 *
 * Only leaves are mocked: the films SELECT in `initFilmCache` and the pg_trgm
 * query underneath `findMatchingFilm`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  filmRows: [] as Array<Record<string, unknown>>,
  /** Rows the mocked pg_trgm query returns, in production column shape. */
  pgRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => Promise.resolve(mocks.filmRows) }),
    execute: async () => mocks.pgRows,
  },
  withDbTimeout: <T>(promise: Promise<T>) => promise,
}));

vi.mock("@/lib/tmdb/blocklist", () => ({
  isBlockedTmdbId: () => false,
}));

import { initFilmCache, lookupFilmInCache, findFilmBySimilarity } from "./film-matching";
import { normalizeTitle } from "../pipeline";

beforeEach(() => {
  mocks.filmRows = [];
  mocks.pgRows = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("normalized cache path", () => {
  it("keeps a sequel's instalment marker, so it cannot collide with the base title", () => {
    // The whole reason the cache path is safe. If any cleaner rule ever starts
    // stripping a bare trailing numeral or Roman numeral, this fails and the
    // exact-match lookup silently becomes a sequel merger.
    expect(normalizeTitle("Practical Magic 2")).not.toBe(normalizeTitle("Practical Magic"));
    expect(normalizeTitle("Rob Zombie's Halloween II")).not.toBe(
      normalizeTitle("Rob Zombie's Halloween"),
    );
    expect(normalizeTitle("Mockingjay - Part 2")).not.toBe(normalizeTitle("Mockingjay - Part 1"));
    expect(normalizeTitle("Scream 2")).not.toBe(normalizeTitle("Scream 3"));
  });

  it("still collapses the decoration it knows, so those keep hitting the cache", () => {
    // The counterpart property: the normalizer must go on erasing the suffixes
    // it recognises, or the cache stops working for the cases it exists for.
    expect(normalizeTitle("BLADE RUNNER 2049 (4K Restoration)")).toBe(
      normalizeTitle("Blade Runner 2049"),
    );
    expect(normalizeTitle("Sing 2 (Sing-Along)")).toBe(normalizeTitle("Sing 2"));
  });

  it("does NOT collapse unrecognised bracketed suffixes, which is why the guard strips them", () => {
    // Measured, not assumed. An unknown suffix keeps its inner text
    // ("toy story 5 bia", "1917 70mm"), so the cache misses and the decision
    // falls to the similarity path — where "Toy Story 5 (BIA)" scored 75% in
    // the run. That is exactly why sequelMarkerOf peels brackets before
    // reading the marker: without it the guard would compare 5 against 5 fine
    // here, but a "(BIA)"-style suffix on a marker-bearing title would hide
    // the marker behind the suffix text.
    expect(normalizeTitle("Toy Story 5 (BIA)")).toBe("toy story 5 bia");
    expect(normalizeTitle("1917 (70mm)")).toBe("1917 70mm");
    expect(normalizeTitle("Toy Story 5 (BIA)")).not.toBe(normalizeTitle("Toy Story 5"));
  });

  it("treats Roman and Arabic renderings as different cache keys", () => {
    // Pre-existing and NOT changed here: the cache is an exact-match index, so
    // "Halloween II" and "Halloween 2" are separate keys and a cache-only
    // resolution would create a duplicate row. The similarity guard now reads
    // them as the same instalment, so the second path resolves it correctly —
    // see the findFilmBySimilarity case below.
    expect(normalizeTitle("Halloween II")).not.toBe(normalizeTitle("Halloween 2"));
  });

  it("misses the cache for a sequel whose base title is cached", async () => {
    // Driven through the real initFilmCache + lookupFilmInCache with the real
    // normalizer, which is the exact production combination.
    mocks.filmRows = [
      { id: "5560542a", title: "Practical Magic", year: 1998, tmdbId: 6435, imdbId: null, posterUrl: null },
    ];
    const cache = await initFilmCache(normalizeTitle);

    expect(lookupFilmInCache(cache, normalizeTitle("Practical Magic"))!.id).toBe("5560542a");
    expect(lookupFilmInCache(cache, normalizeTitle("Practical Magic 2"))).toBeNull();
    expect(cache.stats.hits).toBe(1);
    expect(cache.stats.misses).toBe(1);
  });

  it("hits the cache for an identically numbered title", async () => {
    // "Selected 16" and "Toy Story 5" both exist twice in the films table; a
    // second scrape of the same numbered title must keep resolving.
    mocks.filmRows = [
      { id: "toy-5", title: "Toy Story 5", year: 2026, tmdbId: null, imdbId: null, posterUrl: null },
      { id: "sel-16", title: "Selected 16", year: null, tmdbId: null, imdbId: null, posterUrl: null },
    ];
    const cache = await initFilmCache(normalizeTitle);

    expect(lookupFilmInCache(cache, normalizeTitle("Toy Story 5"))!.id).toBe("toy-5");
    expect(lookupFilmInCache(cache, normalizeTitle("Selected 16"))!.id).toBe("sel-16");
  });
});

describe("findFilmBySimilarity propagates the guard", () => {
  it("returns null for a sequel against its base title", async () => {
    mocks.pgRows = [
      { id: "5560542a", title: "Practical Magic", year: 1998, tmdb_id: 6435, similarity: 0.89 },
      { id: "81fa3c8d", title: "Practical Magic", year: null, tmdb_id: null, similarity: 0.89 },
    ];

    // No source year, then with one: the run produced both shapes and neither
    // may resolve to the base film.
    await expect(findFilmBySimilarity("Practical Magic 2")).resolves.toBeNull();
    await expect(findFilmBySimilarity("Practical Magic 2", 2026)).resolves.toBeNull();
  });

  it("resolves a Roman rendering onto its Arabic row, which the cache cannot", async () => {
    // The cache keys "halloween ii" and "halloween 2" apart, so this pair only
    // ever resolves on the similarity path. The guard must permit it.
    mocks.pgRows = [
      { id: "halloween-2", title: "Halloween 2", year: 1981, tmdb_id: 11281, similarity: 0.9 },
    ];
    await expect(findFilmBySimilarity("Halloween II", 1981)).resolves.toBe("halloween-2");
  });

  it("still returns a legitimate match", async () => {
    mocks.pgRows = [
      { id: "toy-5", title: "Toy Story 5", year: 2026, tmdb_id: null, similarity: 0.75 },
    ];
    await expect(findFilmBySimilarity("Toy Story 5 (BIA)")).resolves.toBe("toy-5");
  });
});
