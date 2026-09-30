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

  // Cases from the 2026-09-21 TypeSafe title experiment. The sync path keeps
  // release years in the title; the scraper cleaner moves them to
  // `extractedYear` instead (see film-title-cleaner.test.ts).
  describe("complete terminal decorations", () => {
    const cases: Array<[string, string]> = [
      ["Casablanca (London Premiere + Q&A)", "Casablanca"],
      ["2001: A Space Odyssey (UK Premiere + Q&A)", "2001: A Space Odyssey"],
      ["Casablanca (London Premiere + Q&amp;A)", "Casablanca"],
      ["Casablanca (UK Premiere)", "Casablanca"],
      ["Casablanca (World Premiere)", "Casablanca"],
      ["Casablanca (VHS SCREENING)", "Casablanca"],
      ["One Man's Seduction (vhs Screening)", "One Man's Seduction"],
      ["Casablanca (B&W)", "Casablanca"],
      // Stacking works when the inner decoration is checked later in the list
      ["Casablanca (35mm) (UK Premiere + Q&A)", "Casablanca"],
      ["Casablanca (4K Restoration) (London Premiere)", "Casablanca"],
      ["Casablanca (London Premiere + Q&A with director)", "Casablanca"],
      ["Casablanca (VHS) (B&W)", "Casablanca"],
      ["Casablanca (B&W) (VHS)", "Casablanca"],
    ];

    for (const [input, expected] of cases) {
      it(`"${input}" → "${expected}"`, () => {
        const result = extractFilmTitleSync(input);
        expect(result.extractedTitle).toBe(expected);
        expect(result.extractedTitle).not.toMatch(/\([^)]*$/);
        expect(extractFilmTitleSync(result.extractedTitle).extractedTitle).toBe(expected);
      });
    }

    const preserved = [
      "Daisies (Sedmikrásky)",
      "A Star Is Born (1954)",
      "Mission: Impossible",
      "2001: A Space Odyssey",
      "The Godfather Part II",
      "Premiere",
    ];

    for (const title of preserved) {
      it(`preserves "${title}"`, () => {
        const result = extractFilmTitleSync(title);
        expect(result.extractedTitle).toBe(title);
        expect(result.extractionMethod).toBe("none");
      });
    }
  });

  describe("reviewed wrapper prefixes", () => {
    const cases: Array<[string, string]> = [
      ["Relaxed Screening: My Father's Shadow", "My Father's Shadow"],
      ["relaxed screening: My Father's Shadow", "My Father's Shadow"],
      ["Relaxed Screening: Spider-Man: Brand New Day", "Spider-Man: Brand New Day"],
      ["Senior Community Cinema: Daisies (Sedmikrásky)", "Daisies (Sedmikrásky)"],
      ["Senior Community Cinema x The Old Ways: Casablanca", "Casablanca"],
      ["Cine-Real presents: 2001: A Space Odyssey", "2001: A Space Odyssey"],
      ["Cine-real presents: Jaws", "Jaws"],
      ["LAFS PRESENTS: Daisies (Sedmikrásky)", "Daisies (Sedmikrásky)"],
      ["Funeral Parade presents The Godfather Part II", "The Godfather Part II"],
      ['Funeral Parade presents "The Long Day Closes"', "The Long Day Closes"],
      ["Funeral Parade presents 'Paris Is Burning'", "Paris Is Burning"],
      ["Funeral Parade presents “The Skin I Live In”", "The Skin I Live In"],
      ["Funeral Parade presents &quot;An Actor&#39;s Revenge&quot;", "An Actor's Revenge"],
    ];

    for (const [input, expected] of cases) {
      it(`"${input}" → "${expected}"`, () => {
        const result = extractFilmTitleSync(input);
        expect(result.extractedTitle).toBe(expected);
        expect(result.isNonFilm).toBe(false);
        expect(extractFilmTitleSync(result.extractedTitle).extractedTitle).toBe(expected);
      });
    }

    it("keeps the film name that shares its first words with a wrapper", () => {
      expect(extractFilmTitleSync("Funeral Parade of Roses").extractedTitle).toBe(
        "Funeral Parade of Roses",
      );
    });
  });

  describe("keyword collisions with real film titles", () => {
    it("treats Quiz Show as a film", () => {
      const result = extractFilmTitleSync("Quiz Show");
      expect(result.isNonFilm).toBe(false);
      expect(result.extractedTitle).toBe("Quiz Show");
    });

    it("treats Official Competition as a film", () => {
      const result = extractFilmTitleSync("Official Competition");
      expect(result.isNonFilm).toBe(false);
      expect(result.extractedTitle).toBe("Official Competition");
    });

    it("treats a BFI Flare single film as a film, not a compilation", () => {
      const result = extractFilmTitleSync("BFI Flare: Moonlight");
      expect(result.extractedTitle).toBe("Moonlight");
      expect(result.isCompilation).toBe(false);
      expect(result.isNonFilm).toBe(false);
    });

    it("treats an LFF single film as a film, not a compilation", () => {
      const result = extractFilmTitleSync("LFF: Hamnet");
      expect(result.extractedTitle).toBe("Hamnet");
      expect(result.isCompilation).toBe(false);
    });

    const events = [
      "Film Quiz Night",
      "TCC Film Quiz",
      "BFI Member Quiz",
      "The Big Ritzy Quiz",
      "Cinema Reading Group",
      "Comedy: Stand-Up Special",
      "Satyajit Ray Short Film Competition",
      "LIFF 2026 Short Film Competition",
    ];

    for (const title of events) {
      it(`still flags "${title}" as a non-film event`, () => {
        expect(extractFilmTitleSync(title).isNonFilm).toBe(true);
      });
    }
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
