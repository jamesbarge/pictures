import { describe, it, expect } from "vitest";
import { cleanFilmTitle, cleanFilmTitleWithMetadata, EVENT_PREFIXES } from "./film-title-cleaner";

describe("cleanFilmTitle", () => {
  describe("existing event prefixes", () => {
    it("strips kids/family prefixes", () => {
      expect(cleanFilmTitle("Saturday Morning Picture Club: Paddington 2")).toBe("Paddington 2");
      expect(cleanFilmTitle("Kids Club: Moana")).toBe("Moana");
      expect(cleanFilmTitle("Family Film Club: Spirited Away")).toBe("Spirited Away");
    });

    it("strips format-based prefixes", () => {
      expect(cleanFilmTitle("35mm: Blue Velvet")).toBe("Blue Velvet");
      expect(cleanFilmTitle("70mm IMAX: Oppenheimer")).toBe("Oppenheimer");
      expect(cleanFilmTitle("4K Restoration: The Shining")).toBe("The Shining");
    });

    it("strips branded series prefixes", () => {
      expect(cleanFilmTitle("Bar Trash 42: Chopping Mall")).toBe("Chopping Mall");
      expect(cleanFilmTitle("Dochouse: The Act of Killing")).toBe("The Act of Killing");
    });
  });

  describe("new community/cultural prefixes (A1)", () => {
    it("strips Screen Cuba presents", () => {
      expect(cleanFilmTitle("Screen Cuba Presents: Lucía")).toBe("Lucía");
      expect(cleanFilmTitle("Screen Cuba Present: Memories of Underdevelopment")).toBe("Memories of Underdevelopment");
    });

    it("strips Shasha Movies presents", () => {
      expect(cleanFilmTitle("Shasha Movies Presents: The Night of Counting the Years")).toBe("The Night of Counting the Years");
      expect(cleanFilmTitle("Shasha Movie Presents: Yeelen")).toBe("Yeelen");
    });

    it("strips LAFS presents", () => {
      expect(cleanFilmTitle("LAFS Presents: Parasite")).toBe("Parasite");
      expect(cleanFilmTitle("LAFS Present: Shoplifters")).toBe("Shoplifters");
    });

    it("strips Lost Reels", () => {
      expect(cleanFilmTitle("Lost Reels: The Third Man")).toBe("The Third Man");
      expect(cleanFilmTitle("Lost Reels: Vertigo")).toBe("Vertigo");
    });

    it("strips Funeral Parade presents", () => {
      expect(cleanFilmTitle("Funeral Parade Presents: Eraserhead")).toBe("Eraserhead");
    });

    it("strips Queer East presents", () => {
      expect(cleanFilmTitle("Queer East Presents: Happy Together")).toBe("Happy Together");
    });

    it("strips Girls in Film presents", () => {
      expect(cleanFilmTitle("Girls in Film Presents: Portrait of a Lady on Fire")).toBe("Portrait of a Lady on Fire");
      expect(cleanFilmTitle("Girl in Film Presents: Cléo from 5 to 7")).toBe("Cléo from 5 to 7");
    });

    it("strips East London Doc Club", () => {
      expect(cleanFilmTitle("East London Doc Club: Honeyland")).toBe("Honeyland");
    });
  });

  describe("pagination artifact stripping (A1)", () => {
    it("strips BFI-style pagination markers", () => {
      expect(cleanFilmTitle("The Chronology of Water p17")).toBe("The Chronology of Water");
      expect(cleanFilmTitle("Hamnet p12")).toBe("Hamnet");
      expect(cleanFilmTitle("Conclave p3")).toBe("Conclave");
    });

    it("does not strip 'p' that is part of a title", () => {
      expect(cleanFilmTitle("Up")).toBe("Up");
    });
  });

  describe("film format suffix stripping (A1)", () => {
    it("strips 'on 35mm' suffix", () => {
      expect(cleanFilmTitle("Vertigo on 35mm")).toBe("Vertigo");
      expect(cleanFilmTitle("Blue Velvet on 35mm")).toBe("Blue Velvet");
    });

    it("strips 'on 70mm' suffix", () => {
      expect(cleanFilmTitle("2001: A Space Odyssey on 70mm")).toBe("2001: A Space Odyssey");
    });

    it("strips trailing format notes", () => {
      expect(cleanFilmTitle("Apocalypse Now - 35mm")).toBe("Apocalypse Now");
      expect(cleanFilmTitle("Blade Runner - 70mm")).toBe("Blade Runner");
    });
  });

  describe("complex Q&A/event suffix stripping (A1)", () => {
    it("strips '+ Live Recording of...' suffixes", () => {
      expect(cleanFilmTitle("The Brutalist + Live Recording of PPF Podcast")).toBe("The Brutalist");
    });

    it("strips '+ Panel hosted by...' suffixes", () => {
      expect(cleanFilmTitle("Moonlight + Panel hosted by Dr Smith")).toBe("Moonlight");
    });

    it("strips duration-prefixed event suffixes", () => {
      expect(cleanFilmTitle("The Zone of Interest (60 mins) + Panel Discussion")).toBe("The Zone of Interest");
      expect(cleanFilmTitle("All We Imagine as Light (90 min) + Q&A")).toBe("All We Imagine as Light");
    });

    it("strips basic Q&A suffixes", () => {
      expect(cleanFilmTitle("Anora + Q&A")).toBe("Anora");
      expect(cleanFilmTitle("The Substance + Q&A with Director")).toBe("The Substance");
    });
  });

  describe("BBFC ratings and format notes", () => {
    it("strips BBFC ratings", () => {
      expect(cleanFilmTitle("Paddington (U)")).toBe("Paddington");
      expect(cleanFilmTitle("The Dark Knight (12A)")).toBe("The Dark Knight");
      expect(cleanFilmTitle("Alien (18)")).toBe("Alien");
    });

    it("strips trailing year", () => {
      expect(cleanFilmTitle("Solaris (1972)")).toBe("Solaris");
    });

    it("strips extended edition/cut parentheticals", () => {
      expect(cleanFilmTitle("Aliens (Extended Edition)")).toBe("Aliens");
      expect(cleanFilmTitle("Batman v Superman (Extended Cut)")).toBe("Batman v Superman");
    });
  });

  describe("preserves legitimate titles", () => {
    it("preserves film franchise colons", () => {
      expect(cleanFilmTitle("Star Wars: The Empire Strikes Back")).toBe("Star Wars: The Empire Strikes Back");
      expect(cleanFilmTitle("Mission Impossible: Fallout")).toBe("Mission Impossible: Fallout");
    });

    it("preserves normal titles", () => {
      expect(cleanFilmTitle("Nosferatu")).toBe("Nosferatu");
      expect(cleanFilmTitle("The Brutalist")).toBe("The Brutalist");
      expect(cleanFilmTitle("Anora")).toBe("Anora");
    });
  });
});

describe("cleanFilmTitleWithMetadata", () => {
  it("returns stripped prefix for event series", () => {
    const result = cleanFilmTitleWithMetadata("Funeral Parade Presents: Eraserhead");
    expect(result.cleanedTitle).toBe("Eraserhead");
    expect(result.strippedPrefix).toBe("Funeral Parade Presents");
    expect(result.strippedSuffix).toBeNull();
  });

  it("returns stripped suffix for Q&A", () => {
    const result = cleanFilmTitleWithMetadata("Anora + Q&A");
    expect(result.cleanedTitle).toBe("Anora");
    expect(result.strippedPrefix).toBeNull();
    expect(result.strippedSuffix).toBe("+ Q&A");
  });

  it("returns both prefix and suffix when present", () => {
    const result = cleanFilmTitleWithMetadata("Lost Reels: Vertigo + Q&A");
    expect(result.cleanedTitle).toBe("Vertigo");
    expect(result.strippedPrefix).toBe("Lost Reels");
    expect(result.strippedSuffix).toBe("+ Q&A");
  });

  it("returns nulls for clean titles", () => {
    const result = cleanFilmTitleWithMetadata("Nosferatu");
    expect(result.cleanedTitle).toBe("Nosferatu");
    expect(result.strippedPrefix).toBeNull();
    expect(result.strippedSuffix).toBeNull();
  });

  it("backward-compatible: cleanFilmTitle returns same string", () => {
    const titles = [
      "Funeral Parade Presents: Eraserhead",
      "Anora + Q&A",
      "Nosferatu",
      "The Chronology of Water p17",
    ];
    for (const title of titles) {
      expect(cleanFilmTitle(title)).toBe(cleanFilmTitleWithMetadata(title).cleanedTitle);
    }
  });
});

describe("EVENT_PREFIXES", () => {
  it("contains the new community/cultural patterns", () => {
    const prefixStrings = EVENT_PREFIXES.map(p => p.source);
    expect(prefixStrings.some(s => s.includes("screen\\s+cuba"))).toBe(true);
    expect(prefixStrings.some(s => s.includes("shasha"))).toBe(true);
    expect(prefixStrings.some(s => s.includes("lafs"))).toBe(true);
    expect(prefixStrings.some(s => s.includes("lost\\s+reels"))).toBe(true);
    expect(prefixStrings.some(s => s.includes("funeral\\s+parade"))).toBe(true);
    expect(prefixStrings.some(s => s.includes("queer\\s+east"))).toBe(true);
    expect(prefixStrings.some(s => s.includes("girls?\\s+in\\s+film"))).toBe(true);
    expect(prefixStrings.some(s => s.includes("east\\s+london\\s+doc"))).toBe(true);
  });
});
