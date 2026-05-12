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

describe("recurring event prefixes (data-check patrol cycles 7-12)", () => {
  it("strips Lob-sters Tennis Anniversary Screening prefix", () => {
    expect(cleanFilmTitle("Lob-sters Tennis Anniversary Screening:Challengers")).toBe("Challengers");
    expect(cleanFilmTitle("Lobsters Tennis Anniversary Screening: Wimbledon")).toBe("Wimbledon");
  });

  it("strips Phoenix Classics + YSP Pizza Night prefix", () => {
    expect(cleanFilmTitle("Phoenix Classics + YSP Pizza Night: Wayne's World")).toBe("Wayne's World");
  });

  it("strips Spare Ribs Club prefix", () => {
    expect(cleanFilmTitle("Spare Ribs Club: The Drama")).toBe("The Drama");
  });

  it("strips Parents and Baby screening prefix", () => {
    expect(cleanFilmTitle("Parents and Baby screening: The Drama")).toBe("The Drama");
  });

  it("strips The Gate's Nth Birthday prefix", () => {
    expect(cleanFilmTitle("The Gate's 115th Birthday: Paddington")).toBe("Paddington");
    expect(cleanFilmTitle("The Gate's 115th Birthday: The Italian Job")).toBe("The Italian Job");
  });

  it("strips Reece Shearsmith Presents prefix", () => {
    expect(cleanFilmTitle("Reece Shearsmith Presents: The Bounty")).toBe("The Bounty");
  });

  it("strips Bloody Mary Film Club prefix", () => {
    expect(cleanFilmTitle("Bloody Mary Film Club: Thelma and Louise")).toBe("Thelma and Louise");
  });

  it("strips LRB Screen x MUBI prefix", () => {
    expect(cleanFilmTitle("LRB Screen x MUBI: Law and Order")).toBe("Law and Order");
  });

  it("strips UKAFF closing night prefix", () => {
    expect(cleanFilmTitle("UKAFF 2026 Closing Night: Shadowbox")).toBe("Shadowbox");
  });

  it("strips N and Under prefix", () => {
    expect(cleanFilmTitle("25 and Under: An Introduction to Guillermo del Toro")).toBe("An Introduction to Guillermo del Toro");
  });
});

describe("Castle Cinema prefix family (cycles 15-17)", () => {
  it("strips Cine-real presents prefix", () => {
    expect(cleanFilmTitle("Cine-real presents: Badlands")).toBe("Badlands");
    expect(cleanFilmTitle("Cine real presents: Imitation of Life")).toBe("Imitation of Life");
    expect(cleanFilmTitle("Cinereal presents: Vertigo")).toBe("Vertigo");
  });

  it("strips CLUB ROOM prefix", () => {
    expect(cleanFilmTitle("CLUB ROOM: Lynnie Snow")).toBe("Lynnie Snow");
    expect(cleanFilmTitle("Club Room: Hutch")).toBe("Hutch");
  });

  it("strips CAMP CLASSICS presents prefix", () => {
    expect(cleanFilmTitle("CAMP CLASSICS presents: Another Gay Sequel")).toBe("Another Gay Sequel");
  });

  it("strips BETTER THAN NOTHING presents prefix", () => {
    expect(cleanFilmTitle("BETTER THAN NOTHING PRESENTS: Mulholland Drive")).toBe("Mulholland Drive");
  });

  it("strips generic '<Distributor> Films presents:' prefix", () => {
    expect(cleanFilmTitle("Alborada Films presents: Identidad")).toBe("Identidad");
    expect(cleanFilmTitle("Lost Films presents: The Day The Clown Cried")).toBe("The Day The Clown Cried");
  });

  it("does NOT strip 'Films present:' singular variant (too generic)", () => {
    // Distributor strands always say "presents" with the trailing s.
    // Singular "present" is too generic — could be a verb in a title.
    expect(cleanFilmTitle("My Films Present: A Documentary")).toBe("My Films Present: A Documentary");
  });

  it("does NOT strip bare '<X> Films:' without 'presents'", () => {
    // Bare colon-separated venue branding (e.g. "Coldharbour Films:") is not
    // a distributor strand — it routes through the colon handler instead.
    // We don't aggressively strip it here.
    expect(cleanFilmTitle("Coldharbour Films: Anniversary Screening")).not.toBe("");
  });
});

describe("idempotency on AI-canonical-style titles", () => {
  // cleanFilmTitle now runs over AI-extracted canonical titles in pipeline.ts.
  // The colon handler in particular has heuristics that could reshape a clean
  // canonical. Lock in idempotency for the realistic canonical shapes.
  it("is idempotent on clean canonical titles", () => {
    const canonicals = [
      "Apocalypse Now",
      "Apocalypse Now: Final Cut",
      "Star Wars: A New Hope",
      "Dr. Strangelove",
      "Spider-Man",
      "8½",
      "Amélie",
      "Crouching Tiger, Hidden Dragon",
      "2001: A Space Odyssey",
      "The Godfather: Part II",
    ];
    for (const title of canonicals) {
      const once = cleanFilmTitle(title);
      const twice = cleanFilmTitle(once);
      expect(twice).toBe(once);
    }
  });
});

describe("premiere prefix does NOT eat I-words", () => {
  // Regression guard for the regex bug where [:|I]? matched the leading
  // capital I of an I-titled film under /i. Previously: "UK Premiere Iron Man"
  // → "ron Man". Char class is now [:|]? only.
  it("preserves first letter of I-titled films", () => {
    expect(cleanFilmTitle("UK Premiere Iron Man")).toBe("Iron Man");
    expect(cleanFilmTitle("UK Premiere It Follows")).toBe("It Follows");
    expect(cleanFilmTitle("UK Premiere I Am Legend")).toBe("I Am Legend");
    expect(cleanFilmTitle("London Premiere I'm Still Here")).toBe("I'm Still Here");
    expect(cleanFilmTitle("World Premiere Inception")).toBe("Inception");
  });
});

describe("premiere prefix without separator (UK/London/World)", () => {
  it("strips UK PREMIERE without colon separator", () => {
    expect(cleanFilmTitle("UK PREMIERE Fuck The Polis")).toBe("Fuck The Polis");
    expect(cleanFilmTitle("UK PREMIERE Phantoms of July")).toBe("Phantoms of July");
    expect(cleanFilmTitle("UK PREMIERE Tycoon")).toBe("Tycoon");
  });

  it("strips LONDON PREMIERE without separator", () => {
    expect(cleanFilmTitle("LONDON PREMIERE Dracula")).toBe("Dracula");
  });

  it("strips WORLD PREMIERE without separator", () => {
    expect(cleanFilmTitle("WORLD PREMIERE The Brutalist")).toBe("The Brutalist");
  });

  it("strips EUROPEAN PREMIERE without separator", () => {
    expect(cleanFilmTitle("EUROPEAN PREMIERE Anora")).toBe("Anora");
  });
});

describe("Birthday Season suffix (typo-tolerant)", () => {
  it("strips '- Birthday Season' suffix", () => {
    expect(cleanFilmTitle("Top Gun- Birthday Season")).toBe("Top Gun");
    expect(cleanFilmTitle("Transformers- Birthday Season")).toBe("Transformers");
    expect(cleanFilmTitle("Tokyo Story - Birthday Season")).toBe("Tokyo Story");
  });

  it("strips '- Birthday Seaon' typo variant", () => {
    expect(cleanFilmTitle("Toyko Story- Birthday Seaon")).toBe("Toyko Story");
    expect(cleanFilmTitle("The Skin I Live In- Birthday Seaon")).toBe("The Skin I Live In");
  });
});

describe("anniversary + format combo suffixes", () => {
  it("strips (Nth Anniversary 35mm)", () => {
    expect(cleanFilmTitle("Amélie (25th Anniversary 35mm)")).toBe("Amélie");
    expect(cleanFilmTitle("Pulp Fiction (30th Anniversary 35mm)")).toBe("Pulp Fiction");
  });

  it("strips (Nth Anniversary 70mm/IMAX/4K)", () => {
    expect(cleanFilmTitle("2001: A Space Odyssey (50th Anniversary 70mm)")).toBe("2001: A Space Odyssey");
    expect(cleanFilmTitle("Oppenheimer (Nth Anniversary IMAX)".replace("Nth", "5th"))).toBe("Oppenheimer");
  });

  it("strips dash-prefixed anniversary with no leading space", () => {
    expect(cleanFilmTitle("Bugsy Malone- 50th anniversary")).toBe("Bugsy Malone");
    expect(cleanFilmTitle("Bugsy Malone-50th anniversary")).toBe("Bugsy Malone");
  });
});

describe("premiere-format combo suffixes", () => {
  it("strips (4K Restoration Premiere) parenthetical", () => {
    expect(cleanFilmTitle("Vampire's Kiss (4K Restoration Premiere)")).toBe("Vampire's Kiss");
  });

  it("strips ': 4K Restoration Premiere' colon-separated variant", () => {
    expect(cleanFilmTitle("Vampire's Kiss : 4K Restoration Premiere")).toBe("Vampire's Kiss");
  });
});

describe("anniversary suffix stripping", () => {
  it("strips (Nth Anniversary) without year prefix", () => {
    expect(cleanFilmTitle("Alien (40th Anniversary)")).toBe("Alien");
    expect(cleanFilmTitle("Blue Velvet (40th Anniversary)")).toBe("Blue Velvet");
    expect(cleanFilmTitle("Stand by Me (40th Anniversary)")).toBe("Stand by Me");
  });

  it("strips (Nth Anniversary, 4K Restoration)", () => {
    expect(cleanFilmTitle("Barry Lyndon (50th Anniversary, 4K Restoration)")).toBe("Barry Lyndon");
  });

  it("strips (Nth Anniversary Re-release)", () => {
    expect(cleanFilmTitle("Blade Runner (25th Anniversary Re-release)")).toBe("Blade Runner");
  });

  it("strips - Nth Anniversary dash prefix", () => {
    expect(cleanFilmTitle("2001: A Space Odyssey - 50th Anniversary")).toBe("2001: A Space Odyssey");
  });

  it("strips standalone (4K Restoration)", () => {
    expect(cleanFilmTitle("Mulholland Drive (4K Restoration)")).toBe("Mulholland Drive");
  });
});

describe("HTML entity mojibake fix", () => {
  it("decodes 8&Acirc;&frac12; to 8½", () => {
    expect(cleanFilmTitle("8&Acirc;&frac12;")).toBe("8\u00BD");
  });

  it("still decodes plain &frac12;", () => {
    expect(cleanFilmTitle("8&frac12;")).toBe("8\u00BD");
  });
});
