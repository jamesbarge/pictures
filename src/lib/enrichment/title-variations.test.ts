import { describe, it, expect } from "vitest";
import { generateTitleVariations, extractYearFromTitle } from "./title-variations";

describe("generateTitleVariations", () => {
  it("returns just the title for clean titles", () => {
    const variations = generateTitleVariations("Nosferatu");
    expect(variations[0]).toBe("Nosferatu");
    // Should also include "The Nosferatu" variation
    expect(variations).toContain("The Nosferatu");
  });

  it("generates variations from event-prefixed titles", () => {
    const variations = generateTitleVariations("Funeral Parade Presents: Eraserhead");
    expect(variations).toContain("Eraserhead");
    expect(variations).toContain("Funeral Parade Presents: Eraserhead");
  });

  it("generates variations from titles with Q&A suffix", () => {
    const variations = generateTitleVariations("The Brutalist + Q&A");
    expect(variations).toContain("The Brutalist");
  });

  it("generates colon-split variations", () => {
    const variations = generateTitleVariations("Lost Reels: Vertigo");
    expect(variations).toContain("Vertigo");
    expect(variations).toContain("Lost Reels");
  });

  it("strips year parenthetical as a variation", () => {
    const variations = generateTitleVariations("Solaris (1972)");
    expect(variations).toContain("Solaris");
  });

  it("handles The prefix toggling", () => {
    const withThe = generateTitleVariations("The Shining");
    expect(withThe).toContain("Shining");

    const withoutThe = generateTitleVariations("Nosferatu");
    expect(withoutThe).toContain("The Nosferatu");
  });

  it("deduplicates variations", () => {
    const variations = generateTitleVariations("Nosferatu");
    const unique = new Set(variations.map(v => v.toLowerCase()));
    expect(unique.size).toBe(variations.length);
  });

  it("handles complex event-wrapped title with Q&A", () => {
    const variations = generateTitleVariations("Screen Cuba Presents: Lucía + Q&A");
    expect(variations).toContain("Lucía");
    expect(variations).toContain("Screen Cuba Presents: Lucía + Q&A");
  });
});

describe("extractYearFromTitle", () => {
  it("extracts year from parenthetical", () => {
    expect(extractYearFromTitle("Solaris (1972)")).toBe(1972);
    expect(extractYearFromTitle("The Killer (1989)")).toBe(1989);
  });

  it("returns null when no year present", () => {
    expect(extractYearFromTitle("Nosferatu")).toBeNull();
    expect(extractYearFromTitle("Anora")).toBeNull();
  });

  it("ignores BBFC ratings that look like years", () => {
    // (12) and (15) should not be treated as years
    expect(extractYearFromTitle("Film (12)")).toBeNull();
    expect(extractYearFromTitle("Film (15)")).toBeNull();
  });
});
