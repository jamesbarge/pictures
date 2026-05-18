import { describe, expect, it } from "vitest";
import { normalizeUrl, slugify } from "./url";

describe("normalizeUrl", () => {
  it("returns absolute http URLs unchanged", () => {
    expect(normalizeUrl("http://example.com/foo", "https://base.com")).toBe(
      "http://example.com/foo",
    );
  });

  it("returns absolute https URLs unchanged", () => {
    expect(normalizeUrl("https://example.com/foo", "https://base.com")).toBe(
      "https://example.com/foo",
    );
  });

  it("prepends baseUrl to root-relative paths", () => {
    expect(normalizeUrl("/films/123", "https://bfi.org.uk")).toBe(
      "https://bfi.org.uk/films/123",
    );
  });

  it("prepends baseUrl + slash to bare paths", () => {
    expect(normalizeUrl("films/123", "https://bfi.org.uk")).toBe(
      "https://bfi.org.uk/films/123",
    );
  });

  it("preserves trailing slashes in root-relative paths", () => {
    expect(normalizeUrl("/films/", "https://bfi.org.uk")).toBe(
      "https://bfi.org.uk/films/",
    );
  });

  it("treats `http`-prefixed-but-non-URL strings as absolute (current contract)", () => {
    // Implementation uses startsWith("http") which matches "http://", "https://",
    // AND any string starting with literal "http" — this is the documented
    // (load-bearing) behaviour. Callers should not pass "httpd-cache/x" etc.
    // Pinning this here so the implicit contract is visible to maintainers.
    expect(normalizeUrl("httpd-cache/x", "https://base.com")).toBe(
      "httpd-cache/x",
    );
  });

  it("does not normalize double-slashes in baseUrl + root-relative join", () => {
    // baseUrl ending in `/` + root-relative path starting with `/` produces a
    // double slash. The implementation does no smart joining; pin this.
    expect(normalizeUrl("/films", "https://base.com/")).toBe(
      "https://base.com//films",
    );
  });
});

describe("slugify", () => {
  it("lowercases the input", () => {
    expect(slugify("Saint Maud")).toBe("saint-maud");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("the godfather part ii")).toBe("the-godfather-part-ii");
  });

  it("strips non-word, non-space, non-hyphen characters (and collapses resulting whitespace)", () => {
    // Strip pass produces "amlie  le fabuleux destin" (two spaces where "é /"
    // was), then the `\s+` collapse normalises to single hyphens.
    // Note: accented `é` is stripped because the regex is `[^\w\s-]`, and `\w`
    // in JavaScript is ASCII-only [A-Za-z0-9_]. This may matter for callers
    // comparing international titles.
    expect(slugify("Amélie / Le Fabuleux Destin")).toBe(
      "amlie-le-fabuleux-destin",
    );
  });

  it("preserves existing hyphens", () => {
    expect(slugify("snow-white")).toBe("snow-white");
  });

  it("preserves underscores (part of \\w)", () => {
    expect(slugify("dr_strangelove")).toBe("dr_strangelove");
  });

  it("collapses multiple consecutive spaces to a single hyphen", () => {
    // `\s+` matches one OR MORE whitespace, replaced with a single `-`.
    expect(slugify("a  b   c")).toBe("a-b-c");
  });

  it("truncates to 50 characters", () => {
    const long = "the unbearable lightness of being is a long title indeed and then some";
    const result = slugify(long);
    expect(result.length).toBe(50);
    expect(result).toBe("the-unbearable-lightness-of-being-is-a-long-title-");
  });

  it("returns an empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("returns an empty string for input that's only stripped characters", () => {
    expect(slugify("!?@#$%")).toBe("");
  });

  it("handles all-whitespace input (single hyphen)", () => {
    // Whitespace passes the `[^\w\s-]` strip, then `\s+` → `-`. Pinning.
    expect(slugify("   ")).toBe("-");
  });
});
