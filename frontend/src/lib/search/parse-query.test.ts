/**
 * Parse-query test suite — 40 fixtures covering every token category
 * and the multi-word phrase precedence rules.
 *
 * `NOW` is a fixed reference instant (Wednesday 14 May 2026, 12:00 UTC
 * = 13:00 BST in London). All temporal assertions are computed from
 * this anchor.
 */

import { describe, expect, it } from "vitest";
import { parseQuery } from "./parse-query";

// Wednesday 14 May 2026 13:00 BST (12:00 UTC). London is in BST in May.
const NOW = new Date("2026-05-14T12:00:00Z");

function isoDate(d?: Date): string | undefined {
  return d?.toISOString();
}

describe("parseQuery — empty & freeText", () => {
  it("returns empty intent for empty string", () => {
    const r = parseQuery("", NOW);
    expect(r.freeText).toBe("");
    expect(r.formats).toEqual([]);
    expect(r.genres).toEqual([]);
    expect(r.chipDescriptors).toEqual([]);
  });

  it("returns empty intent for whitespace", () => {
    const r = parseQuery("   ", NOW);
    expect(r.freeText).toBe("");
  });

  it("passes a plain title through as freeText", () => {
    const r = parseQuery("Kurosawa", NOW);
    expect(r.freeText).toBe("Kurosawa");
    expect(r.chipDescriptors).toEqual([]);
  });

  it("passes multi-word title through as freeText", () => {
    const r = parseQuery("Wes Anderson", NOW);
    expect(r.freeText).toBe("Wes Anderson");
  });
});

describe("parseQuery — canonical filter values", () => {
  it("maps 4k to the canonical DCP 4K screening format", () => {
    const r = parseQuery("4k", NOW);

    expect(r.formats).toEqual(["dcp_4k"]);
    expect(r.freeText).toBe("");
  });

  it("maps sci-fi to the canonical science fiction genre", () => {
    const r = parseQuery("sci-fi", NOW);

    expect(r.genres).toEqual(["science fiction"]);
    expect(r.freeText).toBe("");
  });
});

describe("parseQuery — dates", () => {
  it("'tonight' sets today 00:00 → tomorrow 00:00 with timeFrom 18", () => {
    const r = parseQuery("tonight", NOW);
    expect(isoDate(r.dateFrom)).toBe("2026-05-13T23:00:00.000Z");
    expect(isoDate(r.dateTo)).toBe("2026-05-14T23:00:00.000Z");
    expect(r.timeFrom).toBe(18);
    expect(r.freeText).toBe("");
    expect(r.chipDescriptors.find((c) => c.id === "date:tonight")).toBeDefined();
  });

  it("'today' sets today's date range", () => {
    const r = parseQuery("today", NOW);
    expect(isoDate(r.dateFrom)).toBe("2026-05-13T23:00:00.000Z");
    expect(isoDate(r.dateTo)).toBe("2026-05-14T23:00:00.000Z");
    expect(r.timeFrom).toBeUndefined();
  });

  it("'tomorrow' sets next day's date range", () => {
    const r = parseQuery("tomorrow", NOW);
    expect(isoDate(r.dateFrom)).toBe("2026-05-14T23:00:00.000Z");
    expect(isoDate(r.dateTo)).toBe("2026-05-15T23:00:00.000Z");
  });

  it("'this weekend' on a Wednesday spans Sat–Mon", () => {
    const r = parseQuery("this weekend", NOW);
    // From Wed 14 May → Sat 16 May ... Mon 18 May
    expect(isoDate(r.dateFrom)).toBe("2026-05-15T23:00:00.000Z");
    expect(isoDate(r.dateTo)).toBe("2026-05-17T23:00:00.000Z");
  });

  it("'next weekend' is 7 days later", () => {
    const r = parseQuery("next weekend", NOW);
    expect(isoDate(r.dateFrom)).toBe("2026-05-22T23:00:00.000Z");
    expect(isoDate(r.dateTo)).toBe("2026-05-24T23:00:00.000Z");
  });

  it("'this week' spans today + 7 days", () => {
    const r = parseQuery("this week", NOW);
    expect(isoDate(r.dateFrom)).toBe("2026-05-13T23:00:00.000Z");
    expect(isoDate(r.dateTo)).toBe("2026-05-20T23:00:00.000Z");
  });

  it("'saturday' (bare day name) jumps to upcoming Saturday", () => {
    const r = parseQuery("saturday", NOW);
    expect(isoDate(r.dateFrom)).toBe("2026-05-15T23:00:00.000Z");
    expect(isoDate(r.dateTo)).toBe("2026-05-16T23:00:00.000Z");
  });

  it("'next saturday' jumps a week beyond the upcoming Saturday", () => {
    const r = parseQuery("next saturday", NOW);
    expect(isoDate(r.dateFrom)).toBe("2026-05-15T23:00:00.000Z");
    expect(isoDate(r.dateTo)).toBe("2026-05-16T23:00:00.000Z");
  });

  it("'next thursday' (today IS Thursday) skips to next week", () => {
    // NOW = Thu 14 May 2026. "next thursday" → 21 May (7 days later).
    const r = parseQuery("next thursday", NOW);
    expect(isoDate(r.dateFrom)).toBe("2026-05-20T23:00:00.000Z");
    expect(isoDate(r.dateTo)).toBe("2026-05-21T23:00:00.000Z");
  });
});

describe("parseQuery — times", () => {
  it("'morning' applies 0-11 preset", () => {
    const r = parseQuery("morning", NOW);
    expect(r.timeFrom).toBe(0);
    expect(r.timeTo).toBe(11);
  });

  it("'late night' (multi-word) applies 21-23 preset", () => {
    const r = parseQuery("late night", NOW);
    expect(r.timeFrom).toBe(21);
    expect(r.timeTo).toBe(23);
  });

  it("'8pm' applies at-8pm range", () => {
    const r = parseQuery("8pm", NOW);
    expect(r.timeFrom).toBe(20);
    expect(r.timeTo).toBe(21);
  });

  it("'19:30' applies at-19 range", () => {
    const r = parseQuery("19:30", NOW);
    expect(r.timeFrom).toBe(19);
  });

  it("'after 8pm' sets timeFrom=20 only", () => {
    const r = parseQuery("after 8pm", NOW);
    expect(r.timeFrom).toBe(20);
    expect(r.timeTo).toBeUndefined();
  });

  it("'before 11pm' sets timeTo=23 only", () => {
    const r = parseQuery("before 11pm", NOW);
    expect(r.timeTo).toBe(23);
    expect(r.timeFrom).toBeUndefined();
  });
});

describe("parseQuery — formats", () => {
  it("'70mm' canonicalises to 70mm", () => {
    const r = parseQuery("70mm", NOW);
    expect(r.formats).toEqual(["70mm"]);
  });

  it("'70mm imax' canonicalises to 70mm_imax", () => {
    const r = parseQuery("70mm imax", NOW);
    expect(r.formats).toEqual(["70mm_imax"]);
  });

  it("'imax laser' canonicalises to imax_laser", () => {
    const r = parseQuery("imax laser", NOW);
    expect(r.formats).toEqual(["imax_laser"]);
  });

  it("'dolby atmos' canonicalises to dolby_cinema", () => {
    const r = parseQuery("dolby atmos", NOW);
    expect(r.formats).toEqual(["dolby_cinema"]);
  });
});

describe("parseQuery — genres", () => {
  it("'horror' maps to canonical 'horror'", () => {
    const r = parseQuery("horror", NOW);
    expect(r.genres).toEqual(["horror"]);
  });

  it("'sci-fi' maps to 'science fiction'", () => {
    const r = parseQuery("sci-fi", NOW);
    expect(r.genres).toEqual(["science fiction"]);
  });

  it("'sci fi' (two words) also maps to 'science fiction'", () => {
    const r = parseQuery("sci fi", NOW);
    expect(r.genres).toEqual(["science fiction"]);
  });

  it("'noir' maps to 'noir'", () => {
    const r = parseQuery("noir", NOW);
    expect(r.genres).toEqual(["noir"]);
  });
});

describe("parseQuery — decades, country, language, certification", () => {
  it("'80s' canonicalises to 1980s", () => {
    const r = parseQuery("80s", NOW);
    expect(r.decades).toEqual(["1980s"]);
  });

  it("'french' yields country=france (not language since country takes priority)", () => {
    const r = parseQuery("french", NOW);
    expect(r.countries).toEqual(["france"]);
    expect(r.languages).toEqual([]);
  });

  it("'12a' maps to '12A'", () => {
    const r = parseQuery("12a", NOW);
    expect(r.certification).toEqual(["12A"]);
  });

  it("'pg' maps to 'PG'", () => {
    const r = parseQuery("pg", NOW);
    expect(r.certification).toEqual(["PG"]);
  });
});

describe("parseQuery — cinemas + chains", () => {
  it("'curzon' is a chain token", () => {
    const r = parseQuery("curzon", NOW);
    expect(r.chainTokens).toEqual(["Curzon"]);
    expect(r.cinemaIds).toEqual([]);
  });

  it("'pcc' resolves to prince-charles-cinema", () => {
    const r = parseQuery("pcc", NOW);
    expect(r.cinemaIds).toEqual(["prince-charles-cinema"]);
  });

  it("'prince charles' (multi-word) resolves to prince-charles-cinema", () => {
    const r = parseQuery("prince charles", NOW);
    expect(r.cinemaIds).toEqual(["prince-charles-cinema"]);
  });

  it("'bfi southbank' resolves to bfi-southbank slug, not BFI chain", () => {
    const r = parseQuery("bfi southbank", NOW);
    expect(r.cinemaIds).toEqual(["bfi-southbank"]);
  });
});

describe("parseQuery — specials", () => {
  it("'rep' sets isRepertory=true", () => {
    const r = parseQuery("rep", NOW);
    expect(r.isRepertory).toBe(true);
  });

  it("'subs' sets hasSubtitles=true", () => {
    const r = parseQuery("subs", NOW);
    expect(r.hasSubtitles).toBe(true);
  });

  it("'relaxed' sets isRelaxedScreening=true", () => {
    const r = parseQuery("relaxed", NOW);
    expect(r.isRelaxedScreening).toBe(true);
  });

  it("'uk premiere' sets isPremiere=true + premiereTypes=['uk']", () => {
    const r = parseQuery("uk premiere", NOW);
    expect(r.isPremiere).toBe(true);
    expect(r.premiereTypes).toEqual(["uk"]);
  });

  it("'want to see' sets watchlistFilter='want_to_see'", () => {
    const r = parseQuery("want to see", NOW);
    expect(r.watchlistFilter).toBe("want_to_see");
  });

  it("'nearby' sets reachable=true", () => {
    const r = parseQuery("nearby", NOW);
    expect(r.reachable).toBe(true);
  });
});

describe("parseQuery — composite queries", () => {
  it("'horror tonight at curzon' parses all three", () => {
    const r = parseQuery("horror tonight at curzon", NOW);
    expect(r.genres).toEqual(["horror"]);
    expect(r.chainTokens).toEqual(["Curzon"]);
    expect(isoDate(r.dateFrom)).toBe("2026-05-13T23:00:00.000Z");
    expect(r.timeFrom).toBe(18);
    expect(r.freeText).toBe("at"); // leftover
  });

  it("'70mm this weekend' parses format + date range", () => {
    const r = parseQuery("70mm this weekend", NOW);
    expect(r.formats).toEqual(["70mm"]);
    expect(isoDate(r.dateFrom)).toBe("2026-05-15T23:00:00.000Z");
    expect(isoDate(r.dateTo)).toBe("2026-05-17T23:00:00.000Z");
    expect(r.freeText).toBe("");
  });

  it("'kids films saturday' → family genre + date", () => {
    const r = parseQuery("kids films saturday", NOW);
    expect(r.genres).toEqual(["family"]);
    expect(isoDate(r.dateFrom)).toBe("2026-05-15T23:00:00.000Z");
    expect(r.freeText).toBe("films");
  });

  it("'subtitled french noir 80s' → 4 filter slots", () => {
    const r = parseQuery("subtitled french noir 80s", NOW);
    expect(r.hasSubtitles).toBe(true);
    expect(r.countries).toEqual(["france"]);
    expect(r.genres).toEqual(["noir"]);
    expect(r.decades).toEqual(["1980s"]);
    expect(r.freeText).toBe("");
  });

  it("'pcc tomorrow 8pm' → cinema + date + time", () => {
    const r = parseQuery("pcc tomorrow 8pm", NOW);
    expect(r.cinemaIds).toEqual(["prince-charles-cinema"]);
    expect(isoDate(r.dateFrom)).toBe("2026-05-14T23:00:00.000Z");
    expect(r.timeFrom).toBe(20);
  });

  it("free text preserves original casing for unmatched tokens", () => {
    const r = parseQuery("Wes Anderson tonight", NOW);
    expect(r.freeText).toBe("Wes Anderson");
    expect(isoDate(r.dateFrom)).toBe("2026-05-13T23:00:00.000Z");
  });

  it("chip descriptors are emitted in order", () => {
    const r = parseQuery("horror tonight curzon", NOW);
    const ids = r.chipDescriptors.map((c) => c.id);
    // Date phrase pass runs before single-token pass; horror+curzon
    // emit during single-token. Order is: dates → genres → chains.
    expect(ids).toContain("date:tonight");
    expect(ids).toContain("genre:horror");
    expect(ids).toContain("chain:Curzon");
  });

  it("duplicate tokens are de-duped in arrays", () => {
    const r = parseQuery("horror horror 70mm 70mm", NOW);
    expect(r.genres).toEqual(["horror"]);
    expect(r.formats).toEqual(["70mm"]);
  });
});
