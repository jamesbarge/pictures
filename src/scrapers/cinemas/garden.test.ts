import { beforeEach, describe, it, expect, vi } from "vitest";
import { GardenCinemaScraper } from "./garden";
import { FestivalDetector } from "../festivals/festival-detector";
import type { RawScreening } from "../types";

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
});
