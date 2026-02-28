import { describe, it, expect, vi } from "vitest";

// Mock Anthropic SDK (imported transitively via film-similarity → pipeline)
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: vi.fn() };
    },
  };
});

import { normalizeTitle, cleanFilmTitle } from "./pipeline";

// =============================================================================
// normalizeTitle — Unicode-safe normalization
// =============================================================================

describe("normalizeTitle", () => {
  describe("unicode / accented characters", () => {
    it("decomposes accented characters consistently", () => {
      // Core regression: old regex [^\w\s] stripped 'é' entirely → "amlie"
      expect(normalizeTitle("Amélie")).toBe("amelie");
    });

    it("handles multiple accented characters", () => {
      // "The" is not leading, so it's preserved; colon stripped
      expect(normalizeTitle("Léon: The Professional")).toBe(
        "leon the professional"
      );
    });

    it("handles umlauts", () => {
      expect(normalizeTitle("Das Böse")).toBe("das bose");
    });

    it("handles circumflex", () => {
      expect(normalizeTitle("Fête de la Musique")).toBe("fete de la musique");
    });

    it("handles tilde", () => {
      expect(normalizeTitle("Año Nuevo")).toBe("ano nuevo");
    });

    it("handles cedilla", () => {
      expect(normalizeTitle("Façade")).toBe("facade");
    });

    it("preserves non-Latin characters (CJK, etc.)", () => {
      // Japanese and Chinese characters should survive normalization
      const result = normalizeTitle("千と千尋の神隠し");
      expect(result).toBe("千と千尋の神隠し");
    });
  });

  describe("leading article stripping", () => {
    it("strips leading 'The'", () => {
      expect(normalizeTitle("The Godfather")).toBe("godfather");
    });

    it("does not strip 'The' from middle of title", () => {
      expect(normalizeTitle("Into The Wild")).toBe("into the wild");
    });
  });

  describe("punctuation and whitespace", () => {
    it("strips punctuation but keeps letters and numbers", () => {
      expect(normalizeTitle("Se7en")).toBe("se7en");
    });

    it("collapses whitespace", () => {
      expect(normalizeTitle("  Lost   in   Translation  ")).toBe(
        "lost in translation"
      );
    });

    it("strips commas and periods", () => {
      expect(normalizeTitle("Dr. Strangelove")).toBe("dr strangelove");
    });

    it("handles hyphens", () => {
      expect(normalizeTitle("Spider-Man")).toBe("spiderman");
    });

    it("handles colons", () => {
      expect(normalizeTitle("Star Wars: A New Hope")).toBe(
        "star wars a new hope"
      );
    });
  });

  describe("case normalization", () => {
    it("lowercases everything", () => {
      expect(normalizeTitle("CRASH")).toBe("crash");
    });

    it("handles mixed case", () => {
      // & and . stripped, whitespace collapsed to single space
      expect(normalizeTitle("McCabe & Mrs. Miller")).toBe(
        "mccabe mrs miller"
      );
    });
  });
});

// =============================================================================
// cleanFilmTitle — Year stripping
// =============================================================================

describe("cleanFilmTitle — year stripping", () => {
  it("strips trailing parenthesized year", () => {
    expect(cleanFilmTitle("Crash (1997)")).toBe("Crash");
  });

  it("strips year at end of longer title", () => {
    // "Twin Peaks" is now recognized as a franchise prefix, so the full title is preserved
    expect(cleanFilmTitle("Twin Peaks: Fire Walk With Me (1992)")).toBe(
      "Twin Peaks: Fire Walk With Me"
    );
  });

  it("does not strip year in middle of title", () => {
    // "2001" in the middle of a title should stay
    expect(cleanFilmTitle("2001: A Space Odyssey")).toBe(
      "2001: A Space Odyssey"
    );
  });

  it("does not strip non-year numbers", () => {
    expect(cleanFilmTitle("Apollo 13")).toBe("Apollo 13");
  });

  it("strips year even with extra whitespace", () => {
    expect(cleanFilmTitle("Delicatessen  (1991)")).toBe("Delicatessen");
  });
});

// =============================================================================
// cleanFilmTitle — Event prefix stripping
// =============================================================================

describe("cleanFilmTitle — event prefixes", () => {
  describe("kids/family events", () => {
    it("strips 'Family Film Club:'", () => {
      expect(cleanFilmTitle("Family Film Club: Paddington")).toBe(
        "Paddington"
      );
    });

    it("strips 'Kids Club:'", () => {
      expect(cleanFilmTitle("Kids Club: Spirited Away")).toBe("Spirited Away");
    });

    it("strips 'Toddler Time:'", () => {
      expect(cleanFilmTitle("Toddler Time: Frozen")).toBe("Frozen");
    });

    it("strips 'Big Scream:'", () => {
      expect(cleanFilmTitle("Big Scream: Conclave")).toBe("Conclave");
    });
  });

  describe("holiday/themed events", () => {
    it("strips Galentine's Day prefix", () => {
      expect(cleanFilmTitle("Galentine's Day: Legally Blonde")).toBe(
        "Legally Blonde"
      );
    });

    it("strips Valentine's Day prefix", () => {
      expect(cleanFilmTitle("Valentine's Day: When Harry Met Sally")).toBe(
        "When Harry Met Sally"
      );
    });

    it("handles curly apostrophe in Galentine's", () => {
      expect(cleanFilmTitle("Galentine\u2019s Day: Clueless")).toBe("Clueless");
    });

    it("strips Christmas Classics prefix", () => {
      expect(cleanFilmTitle("Christmas Classics: It's a Wonderful Life")).toBe(
        "It's a Wonderful Life"
      );
    });
  });

  describe("broadcast/encore screenings", () => {
    it("strips 'RBO Encore:'", () => {
      expect(cleanFilmTitle("RBO Encore: Woolf Works")).toBe("Woolf Works");
    });

    it("strips 'ROH Encore:'", () => {
      expect(cleanFilmTitle("ROH Encore: Swan Lake")).toBe("Swan Lake");
    });

    it("strips 'Encore:'", () => {
      expect(cleanFilmTitle("Encore: Carmen")).toBe("Carmen");
    });

    it("strips 'NT Live:'", () => {
      expect(cleanFilmTitle("NT Live: Hamlet")).toBe("Hamlet");
    });

    it("strips 'Met Opera:'", () => {
      expect(cleanFilmTitle("Met Opera: La Bohème")).toBe("La Bohème");
    });

    it("strips RBO Cinema Season with extra text", () => {
      expect(
        cleanFilmTitle("RBO Cinema Season 2025/26: The Nutcracker")
      ).toBe("The Nutcracker");
    });
  });

  describe("sing-along variants", () => {
    it("strips 'Sing-A-Long-A'", () => {
      expect(cleanFilmTitle("Sing-A-Long-A Grease")).toBe("Grease");
    });

    it("strips 'Singalong:'", () => {
      expect(cleanFilmTitle("Singalong: Frozen")).toBe("Frozen");
    });
  });

  describe("venue-specific series", () => {
    it("strips 'Dochouse:'", () => {
      expect(cleanFilmTitle("Dochouse: The Act of Killing")).toBe(
        "The Act of Killing"
      );
    });

    it("strips 'Varda Film Club:'", () => {
      expect(cleanFilmTitle("Varda Film Club: Cleo from 5 to 7")).toBe(
        "Cleo from 5 to 7"
      );
    });

    it("strips 'Bar Trash 42:'", () => {
      expect(cleanFilmTitle("Bar Trash 42: Tetsuo")).toBe("Tetsuo");
    });
  });

  describe("format prefixes", () => {
    it("strips '35mm:'", () => {
      expect(cleanFilmTitle("35mm: Vertigo")).toBe("Vertigo");
    });

    it("strips '70mm IMAX:'", () => {
      expect(cleanFilmTitle("70mm IMAX: Oppenheimer")).toBe("Oppenheimer");
    });

    it("strips '4K Restoration:'", () => {
      expect(cleanFilmTitle("4K Restoration: Stalker")).toBe("Stalker");
    });
  });

  describe("other cruft removal", () => {
    it("strips BBFC ratings", () => {
      expect(cleanFilmTitle("Paddington (PG)")).toBe("Paddington");
    });

    it("strips trailing + Q&A", () => {
      expect(cleanFilmTitle("Aftersun + Q&A with director")).toBe("Aftersun");
    });

    it("strips trailing format notes", () => {
      expect(cleanFilmTitle("Blade Runner - 35mm")).toBe("Blade Runner");
    });

    it("strips (ON 35MM) parenthetical", () => {
      expect(cleanFilmTitle("Mulholland Drive (ON 35MM)")).toBe(
        "Mulholland Drive"
      );
    });

    it("strips anniversary suffix", () => {
      expect(cleanFilmTitle("Alien \u00b7 45th Anniversary")).toBe("Alien");
    });
  });

  describe("combined prefix + year stripping", () => {
    it("strips prefix and year together", () => {
      expect(
        cleanFilmTitle("RBO Encore: Woolf Works (2026)")
      ).toBe("Woolf Works");
    });

    it("preserves legitimate film titles with colons", () => {
      expect(
        cleanFilmTitle("Star Wars: The Empire Strikes Back")
      ).toBe("Star Wars: The Empire Strikes Back");
    });
  });

  describe("franchise title preservation", () => {
    it("preserves Twin Peaks titles (PCC format with spaces around colon)", () => {
      expect(
        cleanFilmTitle("Twin Peaks : Pilot - Northwest Passage")
      ).toBe("Twin Peaks : Pilot - Northwest Passage");
    });

    it("preserves Twin Peaks titles (standard colon)", () => {
      expect(
        cleanFilmTitle("Twin Peaks: Fire Walk With Me")
      ).toBe("Twin Peaks: Fire Walk With Me");
    });

    it("preserves Blade Runner titles", () => {
      expect(cleanFilmTitle("Blade Runner: The Final Cut")).toBe(
        "Blade Runner: The Final Cut"
      );
    });

    it("preserves John Wick titles", () => {
      expect(cleanFilmTitle("John Wick: Chapter 4")).toBe(
        "John Wick: Chapter 4"
      );
    });

    it("preserves Planet of the Apes titles", () => {
      expect(
        cleanFilmTitle("Planet of the Apes: Kingdom")
      ).toBe("Planet of the Apes: Kingdom");
    });
  });
});
