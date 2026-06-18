import { describe, expect, it } from "vitest";

import { extractSlugFromLetterboxdUrl } from "./backfill-letterboxd-slugs";

describe("extractSlugFromLetterboxdUrl", () => {
  it("extracts plain slugs", () => {
    expect(
      extractSlugFromLetterboxdUrl("https://letterboxd.com/film/paprika/"),
    ).toBe("paprika");
  });

  it("extracts year-suffixed slugs", () => {
    expect(
      extractSlugFromLetterboxdUrl(
        "https://letterboxd.com/film/nighthawks-1978/",
      ),
    ).toBe("nighthawks-1978");
  });

  it("handles missing trailing slash and query strings", () => {
    expect(
      extractSlugFromLetterboxdUrl("https://letterboxd.com/film/anora?ref=x"),
    ).toBe("anora");
  });

  it("returns null for /tmdb/-style URLs", () => {
    expect(
      extractSlugFromLetterboxdUrl("https://letterboxd.com/tmdb/4977"),
    ).toBeNull();
  });

  it("returns null for non-letterboxd URLs", () => {
    expect(extractSlugFromLetterboxdUrl("https://example.com/film/x/")).toBeNull();
  });
});
