/**
 * lookupListingFilm against a hand-built cache. DB is mocked; nothing is queried.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => Promise.resolve([]) }) },
  withDbTimeout: <T,>(promise: Promise<T>) => promise,
}));
vi.mock("@/lib/tmdb/blocklist", () => ({ isBlockedTmdbId: () => false }));

import { lookupListingFilm, type FilmCache } from "./film-matching";
import { normalizeTitle } from "../pipeline";

interface Row {
  id: string;
  title: string;
  year?: number | null;
  tmdbId?: number | null;
  directors?: string[];
  posterUrl?: string | null;
}

function cacheOf(rows: Row[]): FilmCache {
  const cache: FilmCache = {
    byTitle: new Map(),
    namesakes: new Map(),
    byTmdbId: new Map(),
    stats: { hits: 0, misses: 0, dbQueries: 0 },
    normalizeTitle,
  };
  for (const row of rows) {
    const film = {
      id: row.id,
      title: row.title,
      originalTitle: null,
      year: row.year ?? null,
      tmdbId: row.tmdbId ?? null,
      imdbId: null,
      posterUrl: row.posterUrl ?? null,
      directors: row.directors ?? [],
    };
    const key = normalizeTitle(row.title);
    cache.byTitle.set(key, film);
    const namesakes = cache.namesakes.get(key) ?? [];
    namesakes.push(film);
    cache.namesakes.set(key, namesakes);
  }
  return cache;
}

describe("lookupListingFilm", () => {
  it("resolves Seven plus Fincher to the TMDB Se7en row", () => {
    const cache = cacheOf([
      { id: "seven", title: "Seven", directors: ["David Fincher"] },
      { id: "se7en", title: "Se7en", year: 1995, tmdbId: 807, directors: ["David Fincher"], posterUrl: "https://image.tmdb.org/se7en" },
    ]);
    expect(lookupListingFilm(cache, "Seven", undefined, "David Fincher")?.id).toBe("se7en");
    expect(lookupListingFilm(cache, "Se7en", 1995, "David Fincher")?.id).toBe("se7en");
  });

  it("does not alias Seven without Fincher", () => {
    const cache = cacheOf([
      { id: "seven", title: "Seven", year: 1979, directors: ["Andy Sidaris"] },
      { id: "se7en", title: "Se7en", year: 1995, tmdbId: 807, directors: ["David Fincher"] },
    ]);
    expect(lookupListingFilm(cache, "Seven", 1979, "Andy Sidaris")?.id).toBe("seven");
  });

  it("matches Ken Russell's The Devils to The Devils when that film's director is Ken Russell", () => {
    const cache = cacheOf([
      { id: "possessive", title: "Ken Russell's The Devils", directors: [] },
      { id: "devils", title: "The Devils", year: 1971, tmdbId: 42013, directors: ["Ken Russell"] },
    ]);
    expect(lookupListingFilm(cache, "Ken Russell's The Devils", undefined, "Ken Russell")?.id).toBe("devils");
  });

  it("matches J.G.Ballard's CRASH to Crash when the scraper director is Cronenberg", () => {
    const cache = cacheOf([
      { id: "crash", title: "Crash", year: 1996, directors: ["David Cronenberg"] },
    ]);
    expect(lookupListingFilm(cache, "J.G.Ballard’s CRASH", 1996, "David Cronenberg")?.id).toBe("crash");
  });

  it("does not match Bram Stoker's Dracula to a Dracula Coppola did not get from the credit", () => {
    const cache = cacheOf([
      { id: "jude", title: "Dracula", year: 2025, directors: ["Radu Jude"] },
      { id: "coppola", title: "Bram Stoker's Dracula", year: 1992, directors: ["Francis Ford Coppola"] },
    ]);
    expect(lookupListingFilm(cache, "Bram Stoker's Dracula", 1992, "Francis Ford Coppola")?.id).toBe("coppola");
  });

  it("leaves Rosemary's Baby and Schindler's List on their own titles", () => {
    const cache = cacheOf([
      { id: "baby", title: "Rosemary's Baby", year: 1968, directors: ["Roman Polanski"] },
      { id: "list", title: "Schindler's List", year: 1993, directors: ["Steven Spielberg"] },
    ]);
    expect(lookupListingFilm(cache, "Rosemary's Baby", 1968, "Roman Polanski")?.id).toBe("baby");
    expect(lookupListingFilm(cache, "Schindler's List", 1993, "Steven Spielberg")?.id).toBe("list");
  });
});
