import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { GardenCinemaScraper } from "./garden";
import { FestivalDetector } from "../festivals/festival-detector";
import type { RawScreening } from "../types";
import { slugify } from "../utils/url";

/**
 * Garden Cinema title cleanup regression tests.
 *
 * Background: the Garden Cinema page renders titles like
 * `<a>What's Up, Doc?          U</a>` where the trailing "U" is the BBFC
 * rating. The original cleaner did `title.replace(rating, "")` which is
 * a substring replace and matches the *first* "U" — including the one
 * inside the word "Up". Result: "What's Up, Doc?" became "What's p, Doc?".
 *
 * The fix anchors the rating strip to end-of-string. These tests pin the
 * regression so it can't sneak back.
 */

describe("GardenCinemaScraper.cleanTitle", () => {
  describe("preserves letters that match the rating mid-title", () => {
    const cases = [
      // The original regression cases
      { raw: "What's Up, Doc?          U", rating: "U", expected: "What's Up, Doc?" },
      { raw: "Bringing Up Baby          U", rating: "U", expected: "Bringing Up Baby" },
      // Other titles whose mid-string letters happen to match the rating
      { raw: "Up U", rating: "U", expected: "Up" },
      { raw: "Singin' in the Rain U", rating: "U", expected: "Singin' in the Rain" },
      { raw: "The Sound of Music U", rating: "U", expected: "The Sound of Music" },
    ];

    it.each(cases)("'$raw' (rating '$rating') → '$expected'", ({ raw, rating, expected }) => {
      expect(GardenCinemaScraper.cleanTitle(raw, rating)).toBe(expected);
    });
  });

  describe("works for multi-character ratings", () => {
    const cases = [
      { raw: "The Godfather 18", rating: "18", expected: "The Godfather" },
      { raw: "Toy Story PG", rating: "PG", expected: "Toy Story" },
      { raw: "Spider-Man 12A", rating: "12A", expected: "Spider-Man" },
      { raw: "The Matrix 15", rating: "15", expected: "The Matrix" },
    ];

    it.each(cases)("'$raw' (rating '$rating') → '$expected'", ({ raw, rating, expected }) => {
      expect(GardenCinemaScraper.cleanTitle(raw, rating)).toBe(expected);
    });
  });

  describe("handles edge cases", () => {
    it("returns title unchanged when rating is empty", () => {
      expect(GardenCinemaScraper.cleanTitle("Casablanca", "")).toBe("Casablanca");
    });

    it("collapses internal whitespace", () => {
      expect(GardenCinemaScraper.cleanTitle("The   Grand   Budapest   Hotel    PG", "PG")).toBe(
        "The Grand Budapest Hotel"
      );
    });

    it("trims leading and trailing whitespace", () => {
      expect(GardenCinemaScraper.cleanTitle("   Pulp Fiction 18   ", "18")).toBe("Pulp Fiction");
    });

    it("does not strip rating-like substring from elsewhere in title", () => {
      // "12 Angry Men" with rating "12" should NOT lose the leading "12"
      expect(GardenCinemaScraper.cleanTitle("12 Angry Men 12A", "12A")).toBe("12 Angry Men");
    });

    it("escapes regex metacharacters in the rating string", () => {
      // Synthetic case: a rating with a "+" character must not break the regex
      expect(GardenCinemaScraper.cleanTitle("Some Film 12A+", "12A+")).toBe("Some Film");
    });

    it("returns empty string for empty input", () => {
      expect(GardenCinemaScraper.cleanTitle("", "U")).toBe("");
    });
  });
});

/**
 * Stats-line runtime capture (plan 006).
 *
 * The Garden Cinema stats line is "Director, Country, Year, Runtime"
 * (e.g. "Greta Gerwig, USA, 2019, 135m."). The scraper has always parsed
 * year + director out of it; these tests pin that runtime now flows onto
 * the emitted RawScreening too, guarded to the 1-600 band.
 */
function fixturePage(stats: string): string {
  return `<html><body>
    <div class="date-block" data-date="2030-06-20">
      <div class="films-list__by-date__film">
        <div class="films-list__by-date__film__title"><a href="/film/little-women/">Little Women</a></div>
        <div class="films-list__by-date__film__rating">U</div>
        <div class="films-list__by-date__film__stats">${stats}</div>
        <a class="screening" href="/checkout/1234/">18:30</a>
      </div>
    </div>
  </body></html>`;
}

async function parse(stats: string): Promise<RawScreening[]> {
  const scraper = new GardenCinemaScraper();
  const internals = scraper as unknown as {
    parsePages: (pages: string[]) => Promise<RawScreening[]>;
  };
  return internals.parsePages([fixturePage(stats)]);
}

describe("GardenCinemaScraper — stats-line runtime → RawScreening.runtime", () => {
  beforeEach(() => {
    vi.spyOn(FestivalDetector, "preload").mockResolvedValue();
  });

  it("forwards runtime from the '135m.' stats format", async () => {
    const screenings = await parse("Greta Gerwig, USA, 2019, 135m.");
    expect(screenings).toHaveLength(1);
    expect(screenings[0].runtime).toBe(135);
  });

  it("forwards runtime from the '117 mins' stats format", async () => {
    const screenings = await parse("Frank Capra, USA, 1946, 117 mins");
    expect(screenings[0].runtime).toBe(117);
  });

  it("forwards year and director alongside runtime (regression)", async () => {
    const screenings = await parse("Greta Gerwig, USA, 2019, 135m.");
    expect(screenings[0].year).toBe(2019);
    expect(screenings[0].director).toBe("Greta Gerwig");
    expect(screenings[0].filmTitle).toBe("Little Women");
  });

  it("leaves runtime undefined when the stats line has none", async () => {
    const screenings = await parse("Greta Gerwig, USA, 2019");
    expect(screenings).toHaveLength(1);
    expect(screenings[0].runtime).toBeUndefined();
  });

  it("does not mistake the year for a runtime", async () => {
    // No unit suffix anywhere — the bare 4-digit year must not become runtime
    const screenings = await parse("Agnès Varda, France, 1962");
    expect(screenings[0].year).toBe(1962);
    expect(screenings[0].runtime).toBeUndefined();
  });

  it("bails on hour formats instead of capturing the minute component", async () => {
    // "3h 21m" must NOT become runtime=21 (a confidently wrong hint)
    const screenings = await parse("Chantal Akerman, Belgium, 1975, 3h 21m");
    expect(screenings[0].runtime).toBeUndefined();
  });

  it("ignores runtime-like tokens that are not the final stats field", async () => {
    // Only the last comma-separated token is parsed for runtime
    const screenings = await parse("Some Director, 35m short program, 2019");
    expect(screenings[0].runtime).toBeUndefined();
  });
});

const SOCIAL_URL =
  "https://bookings.thegardencinema.co.uk/TheGardenCinema.dll/TSelectItems.waSelectItemsPrompt.TcsWebMenuItem_0.TcsWebTab_0.TcsPerformance_6266328.TcsSection_971";
const FATHERLAND_URL =
  "https://bookings.thegardencinema.co.uk/TheGardenCinema.dll/TSelectItems.waSelectItemsPrompt.TcsWebMenuItem_0.TcsWebTab_0.TcsPerformance_6266332.TcsSection_638";

function sharedPerformancePage(): string {
  return `<html><body>
    <div class="date-block" data-date="2030-06-20">
      <div class="films-list__by-date__film">
        <div class="films-list__by-date__film__title"><a href="/film/fatherland/">Fatherland</a></div>
        <div class="films-list__by-date__film__rating">12A</div>
        <div class="films-list__by-date__film__stats">Paweł Pawlikowski, Poland, 2026, 82m.</div>
        <a class="screening" href="${FATHERLAND_URL}">15:30</a>
        <a class="screening" href="${SOCIAL_URL}">16:00</a>
      </div>
      <div class="films-list__by-date__film">
        <div class="films-list__by-date__film__title"><a href="/film/the-social-reckoning/">The Social Reckoning</a></div>
        <div class="films-list__by-date__film__rating">15</div>
        <div class="films-list__by-date__film__stats">Aaron Sorkin, USA, 2026, 112m.</div>
        <a class="screening" href="${SOCIAL_URL}">15:45</a>
      </div>
    </div>
  </body></html>`;
}

describe("GardenCinemaScraper — one Savoy performance, one film", () => {
  beforeEach(() => {
    vi.spyOn(FestivalDetector, "preload").mockResolvedValue();
  });

  it("drops the Fatherland 16:00 row that reuses performance 6266328", async () => {
    const scraper = new GardenCinemaScraper();
    vi.spyOn(scraper as unknown as { fetchPerformancePage(url: string): Promise<string> }, "fetchPerformancePage")
      .mockResolvedValue(`<h1 class="title">The Social Reckoning (15)</h1><p class="perf-time">Thursday 20 Jun 2030, 3:45pm</p>`);
    const screenings = await (
      scraper as unknown as { parsePages(pages: string[]): Promise<RawScreening[]> }
    ).parsePages([sharedPerformancePage()]);

    const labelled = screenings.map((screening) => [
      screening.filmTitle,
      screening.datetime.toISOString(),
      screening.bookingUrl.includes("6266328") ? "6266328" : "6266332",
    ]);
    expect(labelled).toEqual([
      ["Fatherland", "2030-06-20T14:30:00.000Z", "6266332"],
      ["The Social Reckoning", "2030-06-20T14:45:00.000Z", "6266328"],
    ]);
  });

  it("keeps both rows when the booking page cannot be fetched", async () => {
    const scraper = new GardenCinemaScraper();
    vi.spyOn(scraper as unknown as { fetchPerformancePage(url: string): Promise<string> }, "fetchPerformancePage")
      .mockRejectedValue(new Error("timeout"));
    const screenings = await (
      scraper as unknown as { parsePages(pages: string[]): Promise<RawScreening[]> }
    ).parsePages([sharedPerformancePage()]);
    expect(screenings).toHaveLength(3);
  });
});

const FLAMENCO_LISTED = "La guitarra flamenca de Yerai Cortés (The Flamenco Guitar of Yerai Cortés)";
const FLAMENCO_ENGLISH = "The Flamenco Guitar of Yerai Cortés";
const FLAMENCO_URL =
  "https://bookings.thegardencinema.co.uk/TheGardenCinema.dll/TSelectItems.waSelectItemsPrompt.TcsWebMenuItem_0.TcsWebTab_0.TcsPerformance_6223527.TcsSection_971";

function flamencoPage(titles: string[]): string {
  const cards = titles
    .map(
      (title) => `
      <div class="films-list__by-date__film">
        <div class="films-list__by-date__film__title"><a href="/film/flamenco/">${title}</a></div>
        <div class="films-list__by-date__film__rating">PG</div>
        <div class="films-list__by-date__film__stats">Antón Álvarez, Spain, 2024, 95m.</div>
        <a class="screening" href="${FLAMENCO_URL}">18:10</a>
      </div>`,
    )
    .join("");
  return `<html><body><div class="date-block" data-date="2026-11-10">${cards}</div></body></html>`;
}

describe("GardenCinemaScraper — Original (English title)", () => {
  beforeEach(() => {
    vi.spyOn(FestivalDetector, "preload").mockResolvedValue();
    vi.spyOn(FestivalDetector, "detect").mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores the English title and keeps the source id on the listed bilingual string", async () => {
    const scraper = new GardenCinemaScraper();
    const screenings = await (
      scraper as unknown as { parsePages(pages: string[]): Promise<RawScreening[]> }
    ).parsePages([flamencoPage([FLAMENCO_LISTED])]);

    expect(screenings).toHaveLength(1);
    expect(screenings[0].filmTitle).toBe(FLAMENCO_ENGLISH);
    expect(screenings[0].datetime.toISOString()).toBe("2026-11-10T18:10:00.000Z");
    expect(screenings[0].sourceId).toBe(`garden-${slugify(FLAMENCO_LISTED)}-2026-11-10T18:10:00.000Z`);
    expect(screenings[0].year).toBe(2024);
    expect(screenings[0].director).toBe("Antón Álvarez");
    expect(screenings[0].runtime).toBe(95);
  });

  it("emits one screening when the bilingual card and the English card share the performance", async () => {
    const scraper = new GardenCinemaScraper();
    const fetchPage = vi.spyOn(
      scraper as unknown as { fetchPerformancePage(url: string): Promise<string> },
      "fetchPerformancePage",
    );
    const screenings = await (
      scraper as unknown as { parsePages(pages: string[]): Promise<RawScreening[]> }
    ).parsePages([flamencoPage([FLAMENCO_LISTED, FLAMENCO_ENGLISH])]);

    expect(fetchPage).not.toHaveBeenCalled();
    expect(screenings).toHaveLength(1);
    expect(screenings[0].filmTitle).toBe(FLAMENCO_ENGLISH);
    expect(screenings[0].sourceId).toBe(`garden-${slugify(FLAMENCO_ENGLISH)}-2026-11-10T18:10:00.000Z`);
  });

  it("still emits one English screening when the booking page cannot be fetched", async () => {
    const scraper = new GardenCinemaScraper();
    vi.spyOn(
      scraper as unknown as { fetchPerformancePage(url: string): Promise<string> },
      "fetchPerformancePage",
    ).mockRejectedValue(new Error("timeout"));
    const screenings = await (
      scraper as unknown as { parsePages(pages: string[]): Promise<RawScreening[]> }
    ).parsePages([flamencoPage([FLAMENCO_LISTED, FLAMENCO_ENGLISH])]);

    expect(screenings).toHaveLength(1);
    expect(screenings[0].filmTitle).toBe(FLAMENCO_ENGLISH);
  });
});
