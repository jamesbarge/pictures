import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { OrganizationSchema, MovieSchema } from "./json-ld";
import { brand } from "@/lib/brand";
import type { Film } from "@/types/film";

function makeMaliciousFilm(title: string): Film {
  return {
    id: "test-film",
    title,
    originalTitle: null,
    year: 2024,
    runtime: null,
    directors: [],
    cast: [],
    genres: [],
    countries: [],
    languages: [],
    certification: null,
    synopsis: "A test film",
    tagline: null,
    posterUrl: null,
    backdropUrl: null,
    trailerUrl: null,
    isRepertory: false,
    releaseStatus: null,
    decade: null,
    tmdbId: null,
    imdbId: null,
    tmdbRating: null,
    letterboxdUrl: null,
    contentType: "film",
    sourceImageUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("JsonLd XSS prevention", () => {
  it("should escape < in JSON-LD output to prevent script breakout", () => {
    const { container } = render(<OrganizationSchema />);
    const script = container.querySelector(
      'script[type="application/ld+json"]'
    );
    expect(script).toBeTruthy();

    const content = script?.innerHTML || "";
    // URLs like https://... contain < after escaping — verify no raw <
    expect(content).not.toContain("<");
  });

  it("should escape </script> in film titles to prevent XSS", () => {
    const film = makeMaliciousFilm(
      '</script><script>alert("xss")</script>'
    );

    const { container } = render(<MovieSchema film={film} />);
    const script = container.querySelector(
      'script[type="application/ld+json"]'
    );
    expect(script).toBeTruthy();

    const content = script?.innerHTML || "";
    // Must not contain raw </script> which would break out of the tag
    expect(content).not.toContain("</script>");
    expect(content).not.toContain("<script>");
    // The escaped version should be present
    expect(content).toContain("\\u003c/script>");
    expect(content).toContain("\\u003cscript>");
  });

  it("should produce valid JSON after escaping", () => {
    const { container } = render(<OrganizationSchema />);
    const script = container.querySelector(
      'script[type="application/ld+json"]'
    );
    const content = script?.innerHTML || "";

    // \\u003c is valid JSON escape — parsing should succeed
    const parsed = JSON.parse(content);
    expect(parsed["@type"]).toBe("Organization");
    expect(parsed.name).toBe(brand.name);
  });
});
