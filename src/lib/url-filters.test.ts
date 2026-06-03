import { describe, expect, it } from "vitest";
import {
  buildShareableUrl,
  filtersToSearchParams,
  hasFilterParams,
  searchParamsToFilters,
  type ShareableFilters,
} from "./url-filters";

describe("filtersToSearchParams", () => {
  it("returns empty params for empty input", () => {
    const params = filtersToSearchParams({});
    expect(params.toString()).toBe("");
  });

  it("serializes a single cinema ID", () => {
    const params = filtersToSearchParams({ cinemaIds: ["bfi-southbank"] });
    expect(params.get("c")).toBe("bfi-southbank");
  });

  it("joins multiple cinema IDs with commas", () => {
    const params = filtersToSearchParams({
      cinemaIds: ["bfi-southbank", "rio-dalston", "ica"],
    });
    expect(params.get("c")).toBe("bfi-southbank,rio-dalston,ica");
  });

  it("omits empty arrays (no key set when arr is empty)", () => {
    const params = filtersToSearchParams({ cinemaIds: [], formats: [] });
    expect(params.has("c")).toBe(false);
    expect(params.has("fmt")).toBe(false);
  });

  it("serializes dateFrom in yyyy-MM-dd format", () => {
    const params = filtersToSearchParams({
      dateFrom: new Date(2026, 4, 18), // May 18, 2026 (month is 0-indexed)
    });
    expect(params.get("from")).toBe("2026-05-18");
  });

  it("serializes numeric timeFrom/timeTo", () => {
    const params = filtersToSearchParams({ timeFrom: 17, timeTo: 23 });
    expect(params.get("tf")).toBe("17");
    expect(params.get("tt")).toBe("23");
  });

  it("includes timeFrom=0 (midnight is valid, not falsy fallback)", () => {
    // The implementation checks `!== null && !== undefined` so 0 is included.
    const params = filtersToSearchParams({ timeFrom: 0 });
    expect(params.get("tf")).toBe("0");
  });

  it("only emits boolean flags when true (false is the default — omitted)", () => {
    const allFalse = filtersToSearchParams({
      festivalOnly: false,
      onlySingleShowings: false,
    });
    expect(allFalse.has("festonly")).toBe(false);
    expect(allFalse.has("single")).toBe(false);

    const allTrue = filtersToSearchParams({
      festivalOnly: true,
      onlySingleShowings: true,
    });
    expect(allTrue.get("festonly")).toBe("1");
    expect(allTrue.get("single")).toBe("1");
  });

  it("serializes festivalSlug as string", () => {
    const params = filtersToSearchParams({ festivalSlug: "lff-2026" });
    expect(params.get("festival")).toBe("lff-2026");
  });
});

describe("searchParamsToFilters", () => {
  it("returns empty filters for empty URLSearchParams", () => {
    expect(searchParamsToFilters(new URLSearchParams())).toEqual({});
  });

  it("parses cinemaIds, filtering empty entries", () => {
    const params = new URLSearchParams("c=bfi,,rio,");
    expect(searchParamsToFilters(params).cinemaIds).toEqual(["bfi", "rio"]);
  });

  it("parses ISO date strings via parseISO", () => {
    const params = new URLSearchParams("from=2026-05-18");
    const result = searchParamsToFilters(params);
    expect(result.dateFrom).toBeInstanceOf(Date);
    expect(result.dateFrom?.getFullYear()).toBe(2026);
    expect(result.dateFrom?.getMonth()).toBe(4); // May
    expect(result.dateFrom?.getDate()).toBe(18);
  });

  it("validates timeFrom is in [0,23] (out-of-range silently dropped)", () => {
    const params = new URLSearchParams("tf=99");
    expect(searchParamsToFilters(params).timeFrom).toBeUndefined();
  });

  it("accepts timeFrom=0", () => {
    const params = new URLSearchParams("tf=0");
    expect(searchParamsToFilters(params).timeFrom).toBe(0);
  });

  it("silently drops NaN times (not throwing)", () => {
    const params = new URLSearchParams("tf=notanumber");
    expect(searchParamsToFilters(params).timeFrom).toBeUndefined();
  });

  it("validates programmingTypes against the type-guard (drops unknown)", () => {
    const params = new URLSearchParams("type=repertory,wrong_value,new_release");
    expect(searchParamsToFilters(params).programmingTypes).toEqual([
      "repertory",
      "new_release",
    ]);
  });

  it("validates timesOfDay against the type-guard", () => {
    const params = new URLSearchParams("tod=morning,wrong,evening");
    expect(searchParamsToFilters(params).timesOfDay).toEqual([
      "morning",
      "evening",
    ]);
  });

  it("only sets festivalOnly when value === '1' (not 'true', 'yes', etc.)", () => {
    expect(searchParamsToFilters(new URLSearchParams("festonly=1")).festivalOnly).toBe(true);
    expect(searchParamsToFilters(new URLSearchParams("festonly=true")).festivalOnly).toBeUndefined();
    expect(searchParamsToFilters(new URLSearchParams("festonly=0")).festivalOnly).toBeUndefined();
  });
});

describe("filtersToSearchParams + searchParamsToFilters roundtrip", () => {
  it("preserves all fields through a full roundtrip", () => {
    const original: Partial<ShareableFilters> = {
      cinemaIds: ["bfi-southbank", "rio-dalston"],
      dateFrom: new Date(2026, 4, 18),
      dateTo: new Date(2026, 5, 18),
      timeFrom: 17,
      timeTo: 23,
      formats: ["35mm", "imax"],
      programmingTypes: ["repertory"],
      decades: ["1970s", "1980s"],
      genres: ["Drama"],
      timesOfDay: ["evening"],
      festivalSlug: "lff-2026",
      festivalOnly: true,
      onlySingleShowings: true,
    };

    const params = filtersToSearchParams(original);
    const roundtrip = searchParamsToFilters(params);

    expect(roundtrip.cinemaIds).toEqual(original.cinemaIds);
    expect(roundtrip.formats).toEqual(original.formats);
    expect(roundtrip.programmingTypes).toEqual(original.programmingTypes);
    expect(roundtrip.decades).toEqual(original.decades);
    expect(roundtrip.genres).toEqual(original.genres);
    expect(roundtrip.timesOfDay).toEqual(original.timesOfDay);
    expect(roundtrip.dateFrom?.toISOString().slice(0, 10)).toBe(
      original.dateFrom?.toISOString().slice(0, 10),
    );
    expect(roundtrip.dateTo?.toISOString().slice(0, 10)).toBe(
      original.dateTo?.toISOString().slice(0, 10),
    );
    expect(roundtrip.timeFrom).toBe(original.timeFrom);
    expect(roundtrip.timeTo).toBe(original.timeTo);
    expect(roundtrip.festivalSlug).toBe(original.festivalSlug);
    expect(roundtrip.festivalOnly).toBe(true);
    expect(roundtrip.onlySingleShowings).toBe(true);
  });
});

describe("buildShareableUrl", () => {
  it("returns baseUrl unchanged when no filters present", () => {
    expect(buildShareableUrl({}, "https://pictures.london")).toBe(
      "https://pictures.london",
    );
  });

  it("appends ?<params> when filters present", () => {
    const url = buildShareableUrl(
      { cinemaIds: ["bfi-southbank"] },
      "https://pictures.london",
    );
    expect(url).toBe("https://pictures.london?c=bfi-southbank");
  });

  it("falls back to window.location.origin (jsdom default) when no baseUrl arg", () => {
    // vitest config uses `environment: jsdom` so `window` exists and provides
    // `window.location.origin` (jsdom default: http://localhost:3000).
    // Pinning behaviour for the no-baseUrl path.
    const url = buildShareableUrl({ cinemaIds: ["bfi-southbank"] });
    expect(url).toContain("?c=bfi-southbank");
    expect(url.startsWith("http")).toBe(true);
  });
});

describe("hasFilterParams", () => {
  it("returns true when any known filter key is present", () => {
    expect(hasFilterParams(new URLSearchParams("c=bfi"))).toBe(true);
    expect(hasFilterParams(new URLSearchParams("fmt=imax"))).toBe(true);
    expect(hasFilterParams(new URLSearchParams("festonly=1"))).toBe(true);
  });

  it("returns false for unknown keys (does NOT match unrelated params)", () => {
    expect(hasFilterParams(new URLSearchParams("utm_source=twitter"))).toBe(
      false,
    );
  });

  it("returns false for an empty URLSearchParams", () => {
    expect(hasFilterParams(new URLSearchParams())).toBe(false);
  });
});
