import { describe, expect, it } from "vitest";
import { generateSearchVariations } from "./search-variants";

// These tests run the real `extractFilmTitleSync` (no mocking) so they're
// integration tests at the title-extraction module boundary. For simple
// titles without festival-presents-X style prefixes, the extractor is the
// identity function (extractedTitle === originalTitle, confidence=1).
// Variations come from the post-processing logic in generateSearchVariations.

describe("generateSearchVariations", () => {
  it("returns the extracted title first", () => {
    const variants = generateSearchVariations("Fight Club");
    expect(variants[0]).toBe("Fight Club");
  });

  it("adds 'The X' variation when title has no 'The' prefix", () => {
    expect(generateSearchVariations("Godfather")).toContain("The Godfather");
  });

  it("adds 'X' variation when title starts with 'The '", () => {
    expect(generateSearchVariations("The Godfather")).toContain("Godfather");
  });

  it("strips year suffix in parentheses: 'Film (1954)' → 'Film'", () => {
    const variants = generateSearchVariations("Vertigo (1958)");
    expect(variants).toContain("Vertigo (1958)");
    expect(variants).toContain("Vertigo");
  });

  it("does NOT strip year-like suffix that's not at the end", () => {
    // Regex anchors to end-of-string with $, so mid-string parens are kept.
    const variants = generateSearchVariations("(1958) Vertigo");
    expect(variants).not.toContain("Vertigo");
  });

  it("strips trailing two-or-more dots: 'Mad Max...' → 'Mad Max'", () => {
    const variants = generateSearchVariations("Mad Max...");
    expect(variants).toContain("Mad Max");
  });

  it("does NOT strip a single trailing dot", () => {
    // Regex matches `\.{2,}` so single trailing period stays.
    const variants = generateSearchVariations("Mad Max.");
    expect(variants.includes("Mad Max")).toBe(false);
  });

  it("strips trailing unicode ellipsis U+2026", () => {
    const variants = generateSearchVariations("Mad Max…");
    expect(variants).toContain("Mad Max");
  });

  it("adds 'X' variation when title starts with 'A '", () => {
    expect(generateSearchVariations("A Serious Man")).toContain("Serious Man");
  });

  it("does NOT add a prefix-strip variant when title doesn't start with 'A ' (vs 'A...')", () => {
    // "Apocalypse Now" starts with "A" but not "A " (space). Pin behaviour.
    const variants = generateSearchVariations("Apocalypse Now");
    // Should still get the "The Apocalypse Now" variant via the no-The branch.
    expect(variants).toContain("The Apocalypse Now");
    // Should NOT have a 'pocalypse Now' or similar.
    expect(variants.find((v) => v.startsWith("pocalypse"))).toBeUndefined();
  });

  it("deduplicates identical variants", () => {
    // For a no-op title like "X" with no special suffixes, the loop might
    // generate duplicates that should be collapsed. Confirm uniqueness.
    const variants = generateSearchVariations("X");
    expect(new Set(variants).size).toBe(variants.length);
  });

  it("filters out empty strings", () => {
    // The final filter `.filter((v) => v.length > 0)` should drop empties.
    const variants = generateSearchVariations("X");
    expect(variants.every((v) => v.length > 0)).toBe(true);
  });

  it("combines multiple transformations: 'The Lord of the Rings (2001)...'", () => {
    const variants = generateSearchVariations("The Lord of the Rings (2001)...");
    // The year-strip regex requires `(YYYY)` to be at the END of the string,
    // and here the ellipsis is at the end — so year-strip does NOT fire on
    // this input, even though year-strip + ellipsis-strip in sequence would
    // produce the cleanest form. This is documented behaviour: each transform
    // is applied independently to the base, not chained.
    expect(variants).toContain("The Lord of the Rings (2001)...");
    expect(variants).toContain("Lord of the Rings (2001)..."); // The-stripped
    expect(variants).toContain("The Lord of the Rings (2001)"); // ellipsis-stripped
  });

  it("does NOT chain transforms — year and ellipsis don't combine into a single variant", () => {
    // Documenting the limitation noted above as a separate, focused test.
    // If callers want a "fully cleaned" variant they need to apply transforms
    // themselves or extend this function.
    const variants = generateSearchVariations("Vertigo (1958)...");
    // year-strip needs `(YYYY)$`, but `(1958)...` has `...` at the end.
    expect(variants.some((v) => v === "Vertigo")).toBe(false);
  });
});
