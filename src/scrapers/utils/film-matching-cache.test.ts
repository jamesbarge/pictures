/**
 * Tests for the pure cache primitives in src/scrapers/utils/film-matching.ts.
 *
 * Only tests `lookupFilmInCache` + `logCacheStats` — both operate on the
 * FilmCache shape without DB access. The bigger functions in the module
 * (initFilmCache, findFilmBySimilarity, matchAndCreateFromTMDB, etc.) need
 * full Drizzle mocks and are out of scope.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  /** Rows returned by the mocked `db.select().from(films)` in initFilmCache. */
  filmRows: [] as Array<Record<string, unknown>>,
  /** TMDB ids treated as blocklisted by the mocked blocklist module. */
  blockedIds: new Set<number>(),
  /** The column projection initFilmCache passed to `db.select`. */
  projection: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@/db", () => ({
  db: {
    select: (projection?: Record<string, unknown>) => {
      mocks.projection = projection;
      return { from: () => Promise.resolve(mocks.filmRows) };
    },
  },
  withDbTimeout: <T>(promise: Promise<T>) => promise,
}));

vi.mock("@/lib/tmdb/blocklist", () => ({
  isBlockedTmdbId: (id: number) => mocks.blockedIds.has(id),
}));

import {
  initFilmCache,
  lookupFilmInCache,
  logCacheStats,
  yearConflicts,
  type FilmCache,
} from "./film-matching";
import { normalizeTitle } from "../pipeline";

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
    namesakes: new Map(),
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

describe("initFilmCache — preventive blocklist (plan 008 step 2)", () => {
  const normalize = (s: string) => s.toLowerCase().trim();

  beforeEach(() => {
    mocks.filmRows = [];
    mocks.blockedIds = new Set();
  });

  it("does not serve a blocklisted tmdbId via byTmdbId", async () => {
    mocks.filmRows = [
      { id: "f-wrong", title: "Joyland", tmdbId: 111 },
      { id: "f-good", title: "Aftersun", tmdbId: 222 },
    ];
    mocks.blockedIds = new Set([111]);

    const cache = await initFilmCache(normalize);

    expect(cache.byTmdbId.has(111)).toBe(false);
    expect(cache.byTmdbId.get(222)?.id).toBe("f-good");
  });

  it("STILL serves the blocklisted film via byTitle — the duplicate-row trap", async () => {
    // If the title lookup also skipped the row, every screening for this title
    // would re-link to a freshly created duplicate film row. The title lookup
    // must keep returning the existing row; only the tmdb-id index goes blind.
    mocks.filmRows = [{ id: "f-wrong", title: "Joyland", tmdbId: 111 }];
    mocks.blockedIds = new Set([111]);

    const cache = await initFilmCache(normalize);

    expect(lookupFilmInCache(cache, "joyland")?.id).toBe("f-wrong");
  });

  it("leaves non-blocked films fully indexed (both maps)", async () => {
    mocks.filmRows = [{ id: "f-good", title: "Aftersun", tmdbId: 222 }];
    mocks.blockedIds = new Set([111]);

    const cache = await initFilmCache(normalize);

    expect(cache.byTmdbId.get(222)?.id).toBe("f-good");
    expect(lookupFilmInCache(cache, "aftersun")?.id).toBe("f-good");
  });

  it("logs a once-per-run count of cached films carrying blocklisted ids", async () => {
    mocks.filmRows = [
      { id: "f-1", title: "Joyland", tmdbId: 111 },
      { id: "f-2", title: "Dracula", tmdbId: 333 },
      { id: "f-3", title: "Aftersun", tmdbId: 222 },
    ];
    mocks.blockedIds = new Set([111, 333]);
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await initFilmCache(normalize);

    const blockedLine = spy.mock.calls
      .map((c) => String(c[0]))
      .find((m) => m.includes("blocklisted TMDB ids"));
    expect(blockedLine).toBeDefined();
    expect(blockedLine).toContain("2 cached films");
    spy.mockRestore();
  });

  it("does not log the blocklist line when nothing is blocked", async () => {
    mocks.filmRows = [{ id: "f-good", title: "Aftersun", tmdbId: 222 }];
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await initFilmCache(normalize);

    const blockedLine = spy.mock.calls
      .map((c) => String(c[0]))
      .find((m) => m.includes("blocklisted TMDB ids"));
    expect(blockedLine).toBeUndefined();
    spy.mockRestore();
  });
});

describe("initFilmCache: original-title aliases", () => {
  beforeEach(() => {
    mocks.filmRows = [];
    mocks.blockedIds = new Set();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  const lookup = (cache: FilmCache, title: string) => lookupFilmInCache(cache, normalizeTitle(title))?.id;

  it("selects original_title alongside the narrowed columns", async () => {
    await initFilmCache(normalizeTitle);

    expect(Object.keys(mocks.projection ?? {})).toContain("originalTitle");
  });

  it("resolves a venue's original-language title to the film's row", async () => {
    mocks.filmRows = [
      { id: "butcher", title: "The Butcher", originalTitle: "Le Boucher", tmdbId: 2912 },
      { id: "celebration", title: "The Celebration", originalTitle: "Festen", tmdbId: 309 },
      { id: "unfaithful", title: "The Unfaithful Wife", originalTitle: "La Femme infidèle", tmdbId: 8286 },
      { id: "gigolo", title: "A French Gigolo", originalTitle: "Cliente", tmdbId: 15460 },
    ];

    const cache = await initFilmCache(normalizeTitle);

    expect(lookup(cache, "Le Boucher")).toBe("butcher");
    expect(lookup(cache, "Festen")).toBe("celebration");
    expect(lookup(cache, "La Femme infidele")).toBe("unfaithful");
    expect(lookup(cache, "Cliente")).toBe("gigolo");
    expect(lookup(cache, "The Butcher")).toBe("butcher");
  });

  it("lets a title key win over another film's alias, whatever the row order", async () => {
    const alias = { id: "celebration", title: "The Celebration", originalTitle: "Festen", tmdbId: 309 };
    const owner = { id: "festen-2026", title: "Festen", originalTitle: "Festen", tmdbId: 999 };

    mocks.filmRows = [alias, owner];
    expect(lookup(await initFilmCache(normalizeTitle), "Festen")).toBe("festen-2026");

    mocks.filmRows = [owner, alias];
    expect(lookup(await initFilmCache(normalizeTitle), "Festen")).toBe("festen-2026");
  });

  it("indexes neither film when two different films share an alias", async () => {
    mocks.filmRows = [
      { id: "a", title: "Bad Seed", originalTitle: "Mauvaise graine", tmdbId: 82185 },
      { id: "b", title: "Bad Seed (2023)", originalTitle: "Mauvaise Graine", tmdbId: 777 },
    ];

    const cache = await initFilmCache(normalizeTitle);

    expect(lookup(cache, "Mauvaise Graine")).toBeUndefined();
  });

  it("keeps an alias that two rows of the same TMDB film share", async () => {
    mocks.filmRows = [
      { id: "a", title: "The Butcher", originalTitle: "Le Boucher", tmdbId: 2912 },
      { id: "b", title: "The Butcher (1970)", originalTitle: "Le Boucher", tmdbId: 2912 },
    ];

    const cache = await initFilmCache(normalizeTitle);

    expect(lookup(cache, "Le Boucher")).toBe("a");
  });

  it("adds no alias for a film carrying a blocklisted TMDB id", async () => {
    // Its original title came from the wrong TMDB film.
    mocks.filmRows = [{ id: "wrong", title: "Gravity", originalTitle: "Gravité", tmdbId: 111 }];
    mocks.blockedIds = new Set([111]);

    const cache = await initFilmCache(normalizeTitle);

    expect(lookup(cache, "Gravité")).toBeUndefined();
    expect(lookup(cache, "Gravity")).toBe("wrong");
  });

  it("ignores rows without an original title", async () => {
    mocks.filmRows = [{ id: "a", title: "Fjord", tmdbId: 1401459 }];

    const cache = await initFilmCache(normalizeTitle);

    expect(cache.byTitle.size).toBe(1);
  });
});

describe("namesakes: the scraper's release year picks between same-title films", () => {
  const normalize = (s: string) => s.toLowerCase().trim();
  const thisYear = new Date().getFullYear();

  beforeEach(() => {
    mocks.filmRows = [];
    mocks.blockedIds = new Set();
  });

  it("picks the namesake within a year of the release year (PCC lists Heat as 1995)", async () => {
    mocks.filmRows = [
      { id: "heat-1972", title: "Heat", year: 1972, tmdbId: 4579 },
      { id: "heat-1995", title: "Heat", year: 1995, tmdbId: 949 },
    ];
    const cache = await initFilmCache(normalize);

    expect(lookupFilmInCache(cache, "heat", 1995)?.id).toBe("heat-1995");
    expect(lookupFilmInCache(cache, "heat", 1996)?.id).toBe("heat-1995");
    expect(lookupFilmInCache(cache, "heat", 1972)?.id).toBe("heat-1972");
  });

  it.each([
    ["older row first", [1958, 2025]],
    ["newer row first", [2025, 1958]],
  ])("gives a listing with no year the newest film with TMDB data (%s)", async (_, years) => {
    mocks.filmRows = years.map((year) => ({ id: `dracula-${year}`, title: "Dracula", year, tmdbId: year }));
    const cache = await initFilmCache(normalize);

    expect(lookupFilmInCache(cache, "dracula")?.id).toBe("dracula-2025");
  });

  it("still prefers a film with TMDB data over a newer one without", async () => {
    mocks.filmRows = [
      { id: "stub-2026", title: "Persepolis", year: 2026, tmdbId: null },
      { id: "persepolis-2007", title: "Persepolis", year: 2007, tmdbId: 2011 },
    ];
    const cache = await initFilmCache(normalize);

    expect(lookupFilmInCache(cache, "persepolis")?.id).toBe("persepolis-2007");
  });

  it("keeps the first of two films without TMDB data (the newer is usually a screening-year stub)", async () => {
    mocks.filmRows = [
      { id: "nostalghia-1983", title: "Nostalghia", year: 1983, tmdbId: null },
      { id: "stub-2026", title: "Nostalghia", year: 2026, tmdbId: null },
    ];
    const cache = await initFilmCache(normalize);

    expect(lookupFilmInCache(cache, "nostalghia")?.id).toBe("nostalghia-1983");
  });

  it("returns the default film when no namesake fits, and yearConflicts flags it", async () => {
    // Riverside's Hammer Dracula (1958) before a 1958 row exists.
    mocks.filmRows = [{ id: "dracula-2025", title: "Dracula", year: 2025, tmdbId: 1323409 }];
    const cache = await initFilmCache(normalize);
    const film = lookupFilmInCache(cache, "dracula", 1958)!;

    expect(film.id).toBe("dracula-2025");
    expect(yearConflicts(film, 1958)).toBe(true);
    expect(yearConflicts(film, 2024)).toBe(false);
    expect(yearConflicts(film, undefined)).toBe(false);
    expect(yearConflicts({ year: null }, 1958)).toBe(false);
  });

  it("ignores a current-year hint, which may be the screening year", async () => {
    mocks.filmRows = [
      { id: "heat-1972", title: "Heat", year: 1972, tmdbId: 4579 },
      { id: "heat-1995", title: "Heat", year: 1995, tmdbId: 949 },
    ];
    const cache = await initFilmCache(normalize);
    const film = lookupFilmInCache(cache, "heat", thisYear)!;

    expect(film.id).toBe("heat-1995");
    expect(yearConflicts(film, thisYear)).toBe(false);
  });
});
