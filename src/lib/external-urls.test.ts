import { describe, expect, it } from "vitest";
import {
  generateLetterboxdUrl,
  getImdbUrl,
  getTmdbUrl,
} from "./external-urls";

describe("getTmdbUrl", () => {
  it("produces a canonical TMDB movie URL from numeric id", () => {
    expect(getTmdbUrl(550)).toBe("https://www.themoviedb.org/movie/550");
  });

  it("accepts a zero id (no validation)", () => {
    // The function does not validate the id range; documenting current behaviour.
    expect(getTmdbUrl(0)).toBe("https://www.themoviedb.org/movie/0");
  });

  it("accepts a negative id (no validation)", () => {
    expect(getTmdbUrl(-1)).toBe("https://www.themoviedb.org/movie/-1");
  });
});

describe("getImdbUrl", () => {
  it("produces a canonical IMDb title URL from `tt`-prefixed id", () => {
    expect(getImdbUrl("tt0137523")).toBe("https://www.imdb.com/title/tt0137523/");
  });

  it("appends a trailing slash even if the id already has one (current contract)", () => {
    // Pinning behaviour — no normalisation of trailing slashes.
    expect(getImdbUrl("tt0137523/")).toBe(
      "https://www.imdb.com/title/tt0137523//",
    );
  });

  it("does not enforce the `tt` prefix (no validation)", () => {
    expect(getImdbUrl("invalid")).toBe("https://www.imdb.com/title/invalid/");
  });
});

describe("generateLetterboxdUrl", () => {
  it("produces a kebab-case slug for a simple title", () => {
    expect(generateLetterboxdUrl("Fight Club")).toBe(
      "https://letterboxd.com/film/fight-club/",
    );
  });

  it("strips apostrophes (ASCII)", () => {
    expect(generateLetterboxdUrl("Ocean's Eleven")).toBe(
      "https://letterboxd.com/film/oceans-eleven/",
    );
  });

  it("strips smart-quote apostrophes (U+2019, U+2018)", () => {
    // Letterboxd's actual rule strips smart quotes; pin the implementation.
    expect(generateLetterboxdUrl("Ocean’s Eleven")).toBe(
      "https://letterboxd.com/film/oceans-eleven/",
    );
    expect(generateLetterboxdUrl("Ocean‘s Eleven")).toBe(
      "https://letterboxd.com/film/oceans-eleven/",
    );
  });

  it("strips backtick and acute-accent apostrophe variants", () => {
    expect(generateLetterboxdUrl("Ocean´s Eleven")).toBe(
      "https://letterboxd.com/film/oceans-eleven/",
    );
    expect(generateLetterboxdUrl("Ocean`s Eleven")).toBe(
      "https://letterboxd.com/film/oceans-eleven/",
    );
  });

  it("replaces colons with a space (then collapsed to hyphen)", () => {
    expect(generateLetterboxdUrl("Blade Runner: 2049")).toBe(
      "https://letterboxd.com/film/blade-runner-2049/",
    );
  });

  it("replaces dashes and en/em dashes with a space", () => {
    expect(generateLetterboxdUrl("Spider-Man")).toBe(
      "https://letterboxd.com/film/spider-man/",
    );
    expect(generateLetterboxdUrl("Spider–Man")).toBe(
      "https://letterboxd.com/film/spider-man/",
    );
    expect(generateLetterboxdUrl("Spider—Man")).toBe(
      "https://letterboxd.com/film/spider-man/",
    );
  });

  it("expands ampersand to `and`", () => {
    expect(generateLetterboxdUrl("Bonnie & Clyde")).toBe(
      "https://letterboxd.com/film/bonnie-and-clyde/",
    );
  });

  it("strips accented and non-ASCII characters (current behaviour)", () => {
    // The regex `[^a-z0-9\s]` after lowercasing keeps only ASCII letters/digits
    // and whitespace. `é` is stripped. This is the current implementation.
    expect(generateLetterboxdUrl("Amélie")).toBe(
      "https://letterboxd.com/film/amlie/",
    );
  });

  it("strips punctuation (parentheses, question marks)", () => {
    expect(generateLetterboxdUrl("Who Framed Roger Rabbit?")).toBe(
      "https://letterboxd.com/film/who-framed-roger-rabbit/",
    );
    expect(generateLetterboxdUrl("Mad Max (2015)")).toBe(
      "https://letterboxd.com/film/mad-max-2015/",
    );
  });

  it("collapses consecutive whitespace to single hyphen", () => {
    // After replace passes leave double spaces (e.g. colon + dash + space),
    // the final `\s+` collapse normalises to one hyphen.
    expect(generateLetterboxdUrl("A:  B")).toBe(
      "https://letterboxd.com/film/a-b/",
    );
  });

  it("trims surrounding whitespace before final hyphenation", () => {
    expect(generateLetterboxdUrl("  The Matrix  ")).toBe(
      "https://letterboxd.com/film/the-matrix/",
    );
  });

  it("handles an empty title (produces a slug-less URL)", () => {
    // Documenting current behaviour rather than asserting "good" behaviour;
    // callers should validate input before reaching this function.
    expect(generateLetterboxdUrl("")).toBe("https://letterboxd.com/film//");
  });
});
