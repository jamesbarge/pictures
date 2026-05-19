/**
 * Tests for the pure cache primitives in src/scrapers/utils/film-matching.ts.
 *
 * Only tests `lookupFilmInCache` + `logCacheStats` — both operate on the
 * FilmCache shape without DB access. The bigger functions in the module
 * (initFilmCache, findFilmBySimilarity, matchAndCreateFromTMDB, etc.) need
 * full Drizzle mocks and are out of scope.
 */
import { describe, expect, it, vi } from "vitest";
import {
  lookupFilmInCache,
  logCacheStats,
  type FilmCache,
} from "./film-matching";

type FilmRecord = ReturnType<FilmCache["byTitle"]["get"]> extends infer R
  ? R extends undefined
    ? never
    : R
  : never;

function makeFilmRecord(id: string, title: string, tmdbId?: number): FilmRecord {
  return {
    id,
    title,
    tmdbId: tmdbId ?? null,
  } as unknown as FilmRecord;
}

function makeCache(films: FilmRecord[] = []): FilmCache {
  const cache: FilmCache = {
    byTitle: new Map(),
    byTmdbId: new Map(),
    stats: { hits: 0, misses: 0, dbQueries: 0 },
    normalizeTitle: (s: string) => s.toLowerCase().trim(),
  };
  for (const film of films) {
    cache.byTitle.set(cache.normalizeTitle(film.title), film);
    if (film.tmdbId) cache.byTmdbId.set(film.tmdbId, film);
  }
  return cache;
}

describe("lookupFilmInCache", () => {
  it("returns the film and increments hits on cache hit", () => {
    const film = makeFilmRecord("uuid-1", "Vertigo");
    const cache = makeCache([film]);

    const result = lookupFilmInCache(cache, "vertigo");
    expect(result).toBe(film);
    expect(cache.stats.hits).toBe(1);
    expect(cache.stats.misses).toBe(0);
  });

  it("returns null and increments misses on cache miss", () => {
    const cache = makeCache();
    const result = lookupFilmInCache(cache, "vertigo");
    expect(result).toBeNull();
    expect(cache.stats.hits).toBe(0);
    expect(cache.stats.misses).toBe(1);
  });

  it("requires exact normalized title match (no fuzzy fallback)", () => {
    const film = makeFilmRecord("uuid-1", "Vertigo");
    const cache = makeCache([film]);

    // "vertgo" (typo) should miss — the function uses Map.get, no fuzzy match.
    expect(lookupFilmInCache(cache, "vertgo")).toBeNull();
    expect(cache.stats.misses).toBe(1);
  });

  it("accumulates hits/misses across multiple calls", () => {
    const film = makeFilmRecord("uuid-1", "Vertigo");
    const cache = makeCache([film]);

    lookupFilmInCache(cache, "vertigo");
    lookupFilmInCache(cache, "vertigo");
    lookupFilmInCache(cache, "rear window");

    expect(cache.stats.hits).toBe(2);
    expect(cache.stats.misses).toBe(1);
  });
});

describe("logCacheStats", () => {
  it("logs with hit-rate percentage when total > 0", () => {
    const cache = makeCache();
    cache.stats = { hits: 7, misses: 3, dbQueries: 1 };
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logCacheStats(cache);

    expect(spy).toHaveBeenCalled();
    const msg = spy.mock.calls[0][0] as string;
    expect(msg).toContain("7 hits");
    expect(msg).toContain("3 misses");
    expect(msg).toContain("70.0% hit rate");
    expect(msg).toContain("1 DB queries");
    spy.mockRestore();
  });

  it("shows 0% hit rate when total is 0 (no divide-by-zero)", () => {
    const cache = makeCache();
    cache.stats = { hits: 0, misses: 0, dbQueries: 1 };
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logCacheStats(cache);
    const msg = spy.mock.calls[0][0] as string;
    expect(msg).toContain("0% hit rate");
    spy.mockRestore();
  });

  it("formats hit rate to one decimal place", () => {
    const cache = makeCache();
    cache.stats = { hits: 1, misses: 2, dbQueries: 1 };
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logCacheStats(cache);
    const msg = spy.mock.calls[0][0] as string;
    // 1/3 = 33.333...% → "33.3% hit rate"
    expect(msg).toContain("33.3% hit rate");
    spy.mockRestore();
  });
});
