import { describe, expect, it } from "vitest";

import {
  LISTING_QA_2026_11_01_TITLES,
  destinationTitle,
  pickCanonicalFilm,
  repairNote,
  repairSeason,
  repairedEventDescription,
  repairedSeason,
  type CanonicalFilm,
} from "./listings-qa-2026-11-01";

describe("1 Nov 2026 listing repair", () => {
  it("sends the live titles to the film name, and keeps the strand or the cut", () => {
    expect(LISTING_QA_2026_11_01_TITLES.map((title) => ({
      title,
      to: destinationTitle(title),
      note: repairNote(title),
      season: repairSeason(title),
    }))).toEqual([
      {
        title: "MUBI FEST LIVE: A LONG WINTER",
        to: "A Long Winter",
        note: "MUBI FEST LIVE",
        season: "MUBI FEST LIVE",
      },
      {
        title: "Little Shop of Horrors (director\u2019s Cut)",
        to: "Little Shop of Horrors",
        note: "Director's Cut",
        season: null,
      },
    ]);
  });

  it("replaces a bare Q&A note with the festival and still fills an empty season", () => {
    expect(repairedEventDescription("Q&A", "MUBI FEST LIVE", "MUBI FEST LIVE")).toBe("MUBI FEST LIVE");
    expect(repairedEventDescription("Sold out", "MUBI FEST LIVE", "MUBI FEST LIVE")).toBeUndefined();
    expect(repairedSeason(null, "MUBI FEST LIVE")).toBe("MUBI FEST LIVE");
    expect(repairedSeason("Hitchcock", "MUBI FEST LIVE")).toBeUndefined();
  });

  it("writes Director's Cut only when the screening note is empty", () => {
    expect(repairedEventDescription(null, "Director's Cut", null)).toBe("Director's Cut");
    expect(repairedEventDescription("  ", "Director's Cut", null)).toBe("Director's Cut");
    expect(repairedEventDescription("Q&A", "Director's Cut", null)).toBeUndefined();
    expect(repairedEventDescription("Intro", "Director's Cut", null)).toBeUndefined();
  });

  it("prefers the 1986 Little Shop over the 1960 namesake", () => {
    const source: CanonicalFilm = { id: "bad", year: 1986, tmdbId: null };
    const chosen = pickCanonicalFilm(source, [
      { id: "1960", year: 1960, tmdbId: 123 },
      { id: "1986", year: 1986, tmdbId: 456 },
    ]);
    expect(chosen?.id).toBe("1986");
  });

  it("prefers a TMDB row when the bad title has no year", () => {
    const source: CanonicalFilm = { id: "bad", year: null, tmdbId: null };
    const candidates: CanonicalFilm[] = [
      { id: "plain", year: null, tmdbId: null },
      { id: "tmdb", year: 2025, tmdbId: 99 },
    ];
    expect(pickCanonicalFilm(source, candidates)?.id).toBe("tmdb");
  });
});
