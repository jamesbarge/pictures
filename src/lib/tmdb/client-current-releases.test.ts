/**
 * Tests for TMDBClient.getCurrentReleases: the GB now_playing + upcoming
 * lists the matcher uses as release evidence for ambiguous titles.
 *
 * Global fetch is stubbed, so no live TMDB calls happen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TMDBClient } from "./client";

type Page = { id: number; title: string }[];
/** One TMDB list as the API reports it: its pages and its own total_pages. */
type List = { totalPages: number; pages: Page[] };

/** Serve `lists[list].pages[page - 1]` with that list's total_pages, recording every URL. */
function stubTmdb(lists: Record<"now_playing" | "upcoming", List>) {
  const urls: URL[] = [];
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input);
    urls.push(url);
    const list = lists[url.pathname.replace("/3/movie/", "") as keyof typeof lists];
    const page = Number(url.searchParams.get("page"));
    const results = list.pages[page - 1] ?? [];
    return {
      ok: true,
      json: async () => ({
        page,
        results: results.map((r) => ({ ...r, original_title: r.title, release_date: "2026-10-01" })),
        total_pages: list.totalPages,
        total_results: 0,
      }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, urls };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TMDBClient.getCurrentReleases", () => {
  it("reads every page of now_playing and upcoming for region GB", async () => {
    const { urls } = stubTmdb({
      now_playing: { totalPages: 2, pages: [[{ id: 1, title: "Digger" }], [{ id: 2, title: "Verity" }]] },
      upcoming: { totalPages: 1, pages: [[{ id: 3, title: "Pressure" }]] },
    });

    const films = await new TMDBClient("test-key").getCurrentReleases();

    expect(films.map((f) => f.id).sort()).toEqual([1, 2, 3]);
    expect(urls.map((u) => `${u.pathname}?page=${u.searchParams.get("page")}`)).toEqual([
      "/3/movie/now_playing?page=1",
      "/3/movie/now_playing?page=2",
      "/3/movie/upcoming?page=1",
    ]);
    expect(urls.every((u) => u.searchParams.get("region") === "GB")).toBe(true);
  });

  it("stops at 20 pages per list even when TMDB reports more", async () => {
    const { fetchMock } = stubTmdb({
      now_playing: { totalPages: 500, pages: [[{ id: 1, title: "Digger" }]] },
      upcoming: { totalPages: 500, pages: [] },
    });

    await new TMDBClient("test-key").getCurrentReleases();

    expect(fetchMock).toHaveBeenCalledTimes(40);
  });

  it("counts a film listed as both now playing and upcoming once", async () => {
    stubTmdb({
      now_playing: { totalPages: 1, pages: [[{ id: 1, title: "Digger" }]] },
      upcoming: { totalPages: 1, pages: [[{ id: 1, title: "Digger" }, { id: 4, title: "Minotaur" }]] },
    });

    const films = await new TMDBClient("test-key").getCurrentReleases();

    expect(films.map((f) => f.id).sort()).toEqual([1, 4]);
  });

  it("serves the cached list for six hours, then refetches", async () => {
    const { fetchMock } = stubTmdb({
      now_playing: { totalPages: 1, pages: [[{ id: 1, title: "Digger" }]] },
      upcoming: { totalPages: 1, pages: [[{ id: 3, title: "Pressure" }]] },
    });
    const client = new TMDBClient("test-key");

    await client.getCurrentReleases();
    vi.setSystemTime(new Date("2026-10-04T17:59:00Z"));
    await client.getCurrentReleases();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date("2026-10-04T18:01:00Z"));
    await client.getCurrentReleases();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("shares one fetch between concurrent callers", async () => {
    const { fetchMock } = stubTmdb({
      now_playing: { totalPages: 1, pages: [[{ id: 1, title: "Digger" }]] },
      upcoming: { totalPages: 1, pages: [[{ id: 3, title: "Pressure" }]] },
    });
    const client = new TMDBClient("test-key");

    const [a, b] = await Promise.all([client.getCurrentReleases(), client.getCurrentReleases()]);

    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed fetch", async () => {
    const client = new TMDBClient("test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, statusText: "Service Unavailable" })));

    await expect(client.getCurrentReleases()).rejects.toThrow("TMDB API error: 503");

    const { fetchMock } = stubTmdb({
      now_playing: { totalPages: 1, pages: [[{ id: 1, title: "Digger" }]] },
      upcoming: { totalPages: 1, pages: [[{ id: 3, title: "Pressure" }]] },
    });
    const films = await client.getCurrentReleases();

    expect(films).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
