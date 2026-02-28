/**
 * Pattern-Based Title Extractor Tests
 *
 * Tests the sync regex-based film title extraction logic.
 * Converted from the inline testExtractor() function in the original
 * agents/enrichment/title-extractor.ts.
 */

import { describe, it, expect } from "vitest";
import { extractFilmTitleSync } from "./pattern-extractor";
import { generateSearchVariations } from "./search-variants";

describe("extractFilmTitleSync", () => {
  describe("event prefix removal", () => {
    it("should extract title from Saturday Morning Picture Club", () => {
      const result = extractFilmTitleSync("Saturday Morning Picture Club: Song of the Sea");
      expect(result.extractedTitle).toBe("Song of the Sea");
      expect(result.extractionMethod).toBe("prefix_removal");
      expect(result.isNonFilm).toBe(false);
    });

    it("should extract title from Classic Matinee", () => {
      const result = extractFilmTitleSync("Classic Matinee: Sunset Boulevard");
      expect(result.extractedTitle).toBe("Sunset Boulevard");
      expect(result.extractionMethod).toBe("prefix_removal");
    });

    it("should extract title from format prefix", () => {
      const result = extractFilmTitleSync("35mm: The Godfather");
      expect(result.extractedTitle).toBe("The Godfather");
      expect(result.extractionMethod).toBe("prefix_removal");
    });
  });

  describe("suffix removal", () => {
    it("should strip + Intro suffix", () => {
      const result = extractFilmTitleSync("When Harry Met Sally + Intro");
      expect(result.extractedTitle).toBe("When Harry Met Sally");
      expect(result.extractionMethod).toContain("suffix_removal");
    });

    it("should strip (4K Restoration) suffix", () => {
      const result = extractFilmTitleSync("Inland Empire (4K Restoration)");
      expect(result.extractedTitle).toBe("Inland Empire");
    });

    it("should strip anniversary suffix", () => {
      const result = extractFilmTitleSync("Charlie's Angels - 25th Anniversary");
      expect(result.extractedTitle).toBe("Charlie's Angels");
    });
  });

  describe("special patterns", () => {
    it("should extract from Queer Horror Nights with shadow cast", () => {
      const result = extractFilmTitleSync(
        "Queer Horror Nights: THE ROCKY HORROR PICTURE SHOW with Shadow Cast"
      );
      expect(result.extractedTitle).toBe("THE ROCKY HORROR PICTURE SHOW");
      expect(result.extractionMethod).toContain("prefix_removal");
      expect(result.extractionMethod).toContain("suffix_removal");
    });

    it("should extract from presents pattern with quotes", () => {
      const result = extractFilmTitleSync('Funeral Parade presents "A Star Is Born (1954)"');
      expect(result.extractedTitle).toBe("A Star Is Born (1954)");
      expect(result.extractionMethod).toBe("presents_pattern");
    });

    it("should extract from Sing-A-Long-A pattern", () => {
      const result = extractFilmTitleSync("Sing-A-Long-A The Greatest Showman");
      expect(result.extractedTitle).toBe("The Greatest Showman");
      expect(result.extractionMethod).toBe("singalong_pattern");
    });

    it("should strip Double-Bill suffix (double feature split skipped after suffix removal)", () => {
      const result = extractFilmTitleSync("The Gruffalo + The Gruffalo's Child Double-Bill");
      // Double-Bill suffix is removed, but double feature split is intentionally
      // skipped when suffix removal already happened (avoids over-extraction)
      expect(result.extractedTitle).toBe("The Gruffalo + The Gruffalo's Child");
      expect(result.extractionMethod).toContain("suffix_removal");
    });

    it("should extract first film from plain double feature", () => {
      const result = extractFilmTitleSync("The Gruffalo + The Gruffalo's Child");
      expect(result.extractedTitle).toBe("The Gruffalo");
      expect(result.extractionMethod).toContain("double_feature");
    });
  });

  describe("live broadcasts", () => {
    it("should detect Met Opera as live broadcast", () => {
      const result = extractFilmTitleSync("Met Opera Live: Eugene Onegin (2026)");
      expect(result.isLiveBroadcast).toBe(true);
      expect(result.extractedTitle).toBe("Eugene Onegin");
    });

    it("should detect National Theatre Live as live broadcast", () => {
      const result = extractFilmTitleSync("National Theatre Live: Hamlet (2026)");
      expect(result.isLiveBroadcast).toBe(true);
      expect(result.extractedTitle).toBe("Hamlet");
    });
  });

  describe("compilations", () => {
    it("should detect LSFF as compilation", () => {
      const result = extractFilmTitleSync("LSFF: Midnight Movies");
      expect(result.isCompilation).toBe(true);
      expect(result.confidence).toBeLessThanOrEqual(0.3);
    });
  });

  describe("non-film detection", () => {
    it("should detect quiz as non-film", () => {
      const result = extractFilmTitleSync("Film Quiz Night");
      expect(result.isNonFilm).toBe(true);
      expect(result.confidence).toBe(0);
    });

    it("should detect reading group as non-film", () => {
      const result = extractFilmTitleSync("Cinema Reading Group");
      expect(result.isNonFilm).toBe(true);
    });

    it("should detect comedy as non-film", () => {
      const result = extractFilmTitleSync("Comedy: Stand-Up Special");
      expect(result.isNonFilm).toBe(true);
    });
  });

  describe("clean titles (no extraction needed)", () => {
    it("should return clean titles unchanged", () => {
      const result = extractFilmTitleSync("Aguirre, Wrath of God");
      expect(result.extractedTitle).toBe("Aguirre, Wrath of God");
      expect(result.extractionMethod).toBe("none");
      expect(result.confidence).toBe(1.0);
    });
  });

  describe("HTML entity decoding", () => {
    it("should decode &amp; entities", () => {
      const result = extractFilmTitleSync("Classic Matinee: Lock, Stock &amp; Two Smoking Barrels");
      expect(result.extractedTitle).toBe("Lock, Stock & Two Smoking Barrels");
    });

    it("should decode &#39; entities", () => {
      const result = extractFilmTitleSync("Classic Matinee: Singin&#39; in the Rain");
      expect(result.extractedTitle).toBe("Singin' in the Rain");
    });
  });
});

describe("generateSearchVariations", () => {
  it("should include extracted title first", () => {
    const variations = generateSearchVariations("Classic Matinee: Sunset Boulevard");
    expect(variations[0]).toBe("Sunset Boulevard");
  });

  it("should generate The-prefix variation", () => {
    const variations = generateSearchVariations("Godfather");
    expect(variations).toContain("The Godfather");
  });

  it("should strip The-prefix variation", () => {
    const variations = generateSearchVariations("The Godfather");
    expect(variations).toContain("Godfather");
  });

  it("should remove year in parentheses", () => {
    const variations = generateSearchVariations('Funeral Parade presents "A Star Is Born (1954)"');
    expect(variations).toContain("A Star Is Born");
  });

  it("should deduplicate variations", () => {
    const variations = generateSearchVariations("Casablanca");
    const unique = [...new Set(variations)];
    expect(variations.length).toBe(unique.length);
  });
});
