import { describe, it, expect } from "vitest";
import { GardenCinemaScraper } from "./garden";

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
