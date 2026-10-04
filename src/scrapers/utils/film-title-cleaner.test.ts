import { describe, it, expect } from "vitest";
import {
  cleanFilmTitle,
  cleanFilmTitleWithMetadata,
  EVENT_PREFIXES,
  extractEnglishFromBracket,
  getKnownNonFilmTypeFromEntries,
} from "./film-title-cleaner";
import unmatchedTitles from "./fixtures/unmatched-titles-2026-10-04.json";

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

describe("extractEnglishFromBracket", () => {
  it("extracts English when original is non-ASCII", () => {
    const result = extractEnglishFromBracket("La película del rey (A King and His Movie)");
    expect(result.lookup).toBe("A King and His Movie");
    expect(result.display).toBe("La película del rey (A King and His Movie)");
  });

  it("extracts English for accented French titles", () => {
    const result = extractEnglishFromBracket("Ladrón de bicicletas (Bicycle Thieves)");
    expect(result.lookup).toBe("Bicycle Thieves");
  });

  it("does NOT trigger when the original is pure ASCII", () => {
    // "Nine Queens (Nueve reinas)" — the bracket is the original Spanish, not
    // an English translation. ASCII-only `original` → no transform.
    const result = extractEnglishFromBracket("Nine Queens (Nueve reinas)");
    expect(result.lookup).toBe("Nine Queens (Nueve reinas)");
  });

  it("does NOT trigger on subtitle parentheticals", () => {
    const result = extractEnglishFromBracket("2001: A Space Odyssey (50th Anniversary)");
    expect(result.lookup).toBe("2001: A Space Odyssey (50th Anniversary)");
  });

  it("passes through titles with no brackets", () => {
    const result = extractEnglishFromBracket("Cabaret");
    expect(result.lookup).toBe("Cabaret");
    expect(result.display).toBe("Cabaret");
  });
});

describe("learnings.json integration (smoke)", () => {
  it("strips a representative patrol-learned prefix", () => {
    // "Funeral Parade presents " is in the learnings file. The hand-curated
    // regex already covers it, but this test pins behaviour either way so
    // future learnings additions can be verified the same way.
    expect(cleanFilmTitle("Funeral Parade presents Seconds")).toBe("Seconds");
  });

  it("preserves real film titles that share words with learned prefixes", () => {
    // Sanity: 'film club' is in many prefixes but a movie named "Film Club"
    // would still survive (no colon/punctuation after).
    expect(cleanFilmTitle("Some Film That Isn't Stripped")).toBe(
      "Some Film That Isn't Stripped"
    );
  });
});

describe("getKnownNonFilmTypeFromEntries", () => {
  it("returns null when entries is empty or undefined", () => {
    expect(getKnownNonFilmTypeFromEntries("Anything", undefined)).toBeNull();
    expect(getKnownNonFilmTypeFromEntries("Anything", null)).toBeNull();
    expect(getKnownNonFilmTypeFromEntries("Anything", [])).toBeNull();
  });

  it("matches exact title case-insensitively", () => {
    const entries = [{ title: "The Big Ritzy Quiz", type: "event", exact: true }];
    expect(getKnownNonFilmTypeFromEntries("The Big Ritzy Quiz", entries)).toBe("event");
    expect(getKnownNonFilmTypeFromEntries("the big ritzy quiz", entries)).toBe("event");
    expect(getKnownNonFilmTypeFromEntries("THE BIG RITZY QUIZ", entries)).toBe("event");
    expect(getKnownNonFilmTypeFromEntries("The Big Ritzy", entries)).toBeNull();
  });

  it("matches regex pattern entries (mirrors data-check buildNonFilmMatchers)", () => {
    const entries = [
      { regex: true, pattern: "^caf[eé]s? philo", type: "event" },
      { regex: true, pattern: "^baby comptines\\b", type: "event" },
      { regex: true, pattern: "^nickelfest #\\d+", type: "event" },
    ];
    expect(getKnownNonFilmTypeFromEntries("Cafés philo anglais", entries)).toBe("event");
    expect(getKnownNonFilmTypeFromEntries("Cafe philo en français", entries)).toBe("event");
    expect(getKnownNonFilmTypeFromEntries("Baby Comptines 10/06/2026", entries)).toBe("event");
    expect(getKnownNonFilmTypeFromEntries("NICKELFEST #1 - DAY ONE", entries)).toBe("event");
    expect(getKnownNonFilmTypeFromEntries("Nickelfest #2 - Three Day Pass!", entries)).toBe("event");
    expect(getKnownNonFilmTypeFromEntries("Something Else Entirely", entries)).toBeNull();
  });

  it("returns 'event' as default type when type field is missing", () => {
    expect(getKnownNonFilmTypeFromEntries("X", [{ title: "X" }])).toBe("event");
    expect(getKnownNonFilmTypeFromEntries("y", [{ regex: true, pattern: "^y$" }])).toBe("event");
  });

  it("preserves live_broadcast and other custom types", () => {
    const entries = [
      { title: "The Playboy of the Western World", type: "live_broadcast", exact: true },
      { regex: true, pattern: "^andre rieu", type: "live_broadcast" },
    ];
    expect(getKnownNonFilmTypeFromEntries("The Playboy of the Western World", entries)).toBe("live_broadcast");
    expect(getKnownNonFilmTypeFromEntries("Andre Rieu's 2026 Summer Concert", entries)).toBe("live_broadcast");
  });

  it("checks exact entries before regex entries", () => {
    // If both an exact and a regex entry would match, exact wins.
    const entries = [
      { title: "Cafés philo anglais", type: "event", exact: true },
      { regex: true, pattern: "^cafés? philo", type: "live_broadcast" },
    ];
    // Exact entry comes first in iteration, returns 'event' — regex never runs.
    expect(getKnownNonFilmTypeFromEntries("Cafés philo anglais", entries)).toBe("event");
  });

  it("silently skips entries with malformed regex without breaking subsequent matches", () => {
    const entries = [
      { regex: true, pattern: "[invalid(regex", type: "event" }, // malformed
      { regex: true, pattern: "^valid pattern$", type: "live_broadcast" },
    ];
    expect(getKnownNonFilmTypeFromEntries("valid pattern", entries)).toBe("live_broadcast");
  });

  it("ignores entries lacking both title and pattern", () => {
    const entries = [
      { type: "event" }, // neither title nor pattern
      { exact: true, type: "event" }, // exact without title
      { regex: true, type: "event" }, // regex without pattern
    ];
    expect(getKnownNonFilmTypeFromEntries("anything", entries)).toBeNull();
  });
});

describe("decoration suffixes + (YYYY) capture (plan 008)", () => {
  describe("table-driven acceptance cases", () => {
    const cases: Array<{ input: string; cleaned: string; year?: number }> = [
      // Stacked decorations need the fixpoint loop
      { input: "AKIRA (2026 Re-release) (Subbed)", cleaned: "AKIRA", year: 2026 },
      { input: "Boogie Nights (4K Restoration)", cleaned: "Boogie Nights" },
      { input: "Princess Mononoke (Subbed)", cleaned: "Princess Mononoke" },
      { input: "Princess Mononoke (Dubbed)", cleaned: "Princess Mononoke" },
      { input: "Seven Samurai (4K)", cleaned: "Seven Samurai" },
      // Event prefix recoveries from the 2026-06-11 unmatched audit
      { input: "CAMP CLASSICS presents Barbarella", cleaned: "Barbarella" },
      // Plain trailing year is captured as a hint, not discarded
      { input: "Jaws (1975)", cleaned: "Jaws", year: 1975 },
      // Decoration year + plain year: the plain release year wins
      { input: "Akira (1988) (2026 Re-release)", cleaned: "Akira", year: 1988 },
      // Decoration strip can expose a trailing (YYYY) — still captured
      { input: "Suspiria (1977) (4K Restoration)", cleaned: "Suspiria", year: 1977 },
    ];

    for (const { input, cleaned, year } of cases) {
      it(`"${input}" → "${cleaned}"${year ? ` + year ${year}` : ""}`, () => {
        const result = cleanFilmTitleWithMetadata(input);
        expect(result.cleanedTitle).toBe(cleaned);
        if (year) {
          expect(result.extractedYear).toBe(year);
        }
      });
    }
  });

  describe("historical prefix-as-title failures must NOT strip", () => {
    const preserved = [
      // "The Old Ways" is a film-ish name, not a curatorial prefix — the
      // after-colon part must not be promoted to the title.
      "The Old Ways: A Century in Sound",
      // Franchise / subtitle colons stay intact
      "Star Wars: The Empire Strikes Back",
    ];

    for (const title of preserved) {
      it(`preserves "${title}"`, () => {
        expect(cleanFilmTitle(title)).toBe(title);
      });
    }

    it("does not strip (Subbed)/(Dubbed)-like words mid-title", () => {
      expect(cleanFilmTitle("Dubbed in Blood")).toBe("Dubbed in Blood");
    });
  });

  it("extractedYear is undefined when no year present", () => {
    expect(cleanFilmTitleWithMetadata("Nosferatu").extractedYear).toBeUndefined();
  });

  it("remains idempotent on already-clean output", () => {
    const once = cleanFilmTitle("AKIRA (2026 Re-release) (Subbed)");
    expect(cleanFilmTitle(once)).toBe(once);
  });
});

describe("fixpoint cap boundary (plan 008)", () => {
  it("resolves three stacked decorations within the 3-pass cap", () => {
    expect(cleanFilmTitle("AKIRA (2026 Re-release) (Subbed) (4K)")).toBe("AKIRA");
  });
});

// Cases from the 2026-09-21 TypeSafe title experiment. Contract difference
// from `extractFilmTitleSync`: this cleaner moves a trailing release year into
// `extractedYear` (plan 008) instead of keeping it in the title.
describe("complete terminal decorations", () => {
  const cases: Array<{ input: string; cleaned: string; suffix?: string }> = [
    { input: "Casablanca (London Premiere + Q&A)", cleaned: "Casablanca", suffix: "(London Premiere + Q&A)" },
    { input: "2001: A Space Odyssey (UK Premiere + Q&A)", cleaned: "2001: A Space Odyssey" },
    { input: "Casablanca (London Premiere + Q&amp;A)", cleaned: "Casablanca" },
    { input: "Casablanca (UK Premiere)", cleaned: "Casablanca" },
    { input: "Casablanca (World Premiere)", cleaned: "Casablanca" },
    { input: "Casablanca (VHS SCREENING)", cleaned: "Casablanca" },
    { input: "One Man's Seduction (vhs Screening)", cleaned: "One Man's Seduction" },
    { input: "Casablanca (B&W)", cleaned: "Casablanca" },
    // Stacked decorations resolve through the fixpoint loop
    { input: "Casablanca (B&W) (VHS Screening)", cleaned: "Casablanca" },
    // "(35mm)" has no rule in this cleaner (only "(on 35mm)" and "- 35mm"), so
    // the stacked case uses a decoration this path already strips.
    { input: "Casablanca (4K Restoration) (UK Premiere + Q&A)", cleaned: "Casablanca" },
    { input: "Casablanca (UK Premiere + Q&A) (PG)", cleaned: "Casablanca" },
    { input: "Casablanca (London Premiere + Q&A with director)", cleaned: "Casablanca" },
    { input: "Casablanca (VHS) (B&W)", cleaned: "Casablanca" },
  ];

  for (const { input, cleaned, suffix } of cases) {
    it(`"${input}" → "${cleaned}"`, () => {
      const result = cleanFilmTitleWithMetadata(input);
      expect(result.cleanedTitle).toBe(cleaned);
      expect(result.cleanedTitle).not.toMatch(/\([^)]*$/);
      if (suffix) expect(result.strippedSuffix).toBe(suffix);
      expect(cleanFilmTitle(result.cleanedTitle)).toBe(cleaned);
    });
  }

  it("keeps a release year as a hint rather than in the title", () => {
    const result = cleanFilmTitleWithMetadata("A Star Is Born (1954)");
    expect(result.cleanedTitle).toBe("A Star Is Born");
    expect(result.extractedYear).toBe(1954);
  });

  const preserved = [
    "Daisies (Sedmikrásky)",
    "Mission: Impossible",
    "Mission: Impossible - Fallout",
    "2001: A Space Odyssey",
    "The Godfather Part II",
    "Rocky II",
  ];

  for (const title of preserved) {
    it(`preserves "${title}"`, () => {
      expect(cleanFilmTitle(title)).toBe(title);
    });
  }
});

describe("reviewed wrapper prefixes", () => {
  const cases: Array<{ input: string; cleaned: string; prefix: string }> = [
    { input: "Relaxed Screening: My Father's Shadow", cleaned: "My Father's Shadow", prefix: "Relaxed Screening" },
    { input: "relaxed screening: My Father's Shadow", cleaned: "My Father's Shadow", prefix: "relaxed screening" },
    { input: "Relaxed Screening: Spider-Man: Brand New Day", cleaned: "Spider-Man: Brand New Day", prefix: "Relaxed Screening" },
    { input: "Senior Community Cinema: Daisies (Sedmikrásky)", cleaned: "Daisies (Sedmikrásky)", prefix: "Senior Community Cinema" },
    { input: "Senior Community Cinema x The Old Ways: Casablanca", cleaned: "Casablanca", prefix: "Senior Community Cinema x The Old Ways" },
    { input: "Senior Community Cinema: The Old Ways: A Century in Sound", cleaned: "The Old Ways: A Century in Sound", prefix: "Senior Community Cinema" },
    { input: "Cine-Real presents: 2001: A Space Odyssey", cleaned: "2001: A Space Odyssey", prefix: "Cine-Real presents" },
    { input: "LAFS PRESENTS: Daisies (Sedmikrásky)", cleaned: "Daisies (Sedmikrásky)", prefix: "LAFS PRESENTS" },
    { input: "Funeral Parade presents The Godfather Part II", cleaned: "The Godfather Part II", prefix: "Funeral Parade presents" },
    { input: 'Funeral Parade presents "The Long Day Closes"', cleaned: "The Long Day Closes", prefix: "Funeral Parade presents" },
    { input: "Funeral Parade presents 'Paris Is Burning'", cleaned: "Paris Is Burning", prefix: "Funeral Parade presents" },
    { input: "Funeral Parade presents “The Skin I Live In”", cleaned: "The Skin I Live In", prefix: "Funeral Parade presents" },
    { input: "Funeral Parade presents &quot;An Actor&#39;s Revenge&quot;", cleaned: "An Actor's Revenge", prefix: "Funeral Parade presents" },
  ];

  for (const { input, cleaned, prefix } of cases) {
    it(`"${input}" → "${cleaned}"`, () => {
      const result = cleanFilmTitleWithMetadata(input);
      expect(result.cleanedTitle).toBe(cleaned);
      expect(result.strippedPrefix).toBe(prefix);
      expect(cleanFilmTitle(result.cleanedTitle)).toBe(cleaned);
    });
  }

  it("keeps quotes that belong to the title when no wrapper was stripped", () => {
    expect(cleanFilmTitle('"Wonderful" Life')).toBe('"Wonderful" Life');
  });

  it("only unwraps quotes after a reviewed wrapper", () => {
    expect(cleanFilmTitle('Kids Club: "Weird" Science "Two"')).toBe('"Weird" Science "Two"');
  });

  it("leaves a quoted double bill intact", () => {
    expect(cleanFilmTitle('Funeral Parade presents "Paris Is Burning" + "Tongues Untied"')).toBe(
      '"Paris Is Burning" + "Tongues Untied"',
    );
  });

  it("still strips a short event prefix that begins with Mission", () => {
    expect(cleanFilmTitle("Mission Club: Casablanca")).toBe("Casablanca");
  });

  it("keeps the film name that shares its first words with a wrapper", () => {
    expect(cleanFilmTitle("Funeral Parade of Roses")).toBe("Funeral Parade of Roses");
  });
});

// Titles from the 2026-10-04 coverage pass: 534 upcoming films had no TMDB
// match, and these decorations were why many of them never reached a search.
// The learnings file that could carry such rules is gitignored and absent in
// CI, so each rule lives in code and is pinned here.
describe("2026-10-04 unmatched-coverage decorations", () => {
  function expectCleaned(cases: Array<{ input: string; cleaned: string; year?: number }>) {
    for (const { input, cleaned, year } of cases) {
      it(`"${input}" → "${cleaned}"${year ? ` + year ${year}` : ""}`, () => {
        const result = cleanFilmTitleWithMetadata(input);
        expect(result.cleanedTitle).toBe(cleaned);
        if (year) expect(result.extractedYear).toBe(year);
        expect(cleanFilmTitle(result.cleanedTitle)).toBe(cleaned);
      });
    }
  }

  describe("festival tag suffixes", () => {
    expectCleaned([
      { input: "Madame FFFL", cleaned: "Madame" },
      { input: "Coward - FFFL", cleaned: "Coward" },
      { input: "Case 137 FFF", cleaned: "Case 137" },
      { input: "Viva Carmen! FFFL", cleaned: "Viva Carmen!" },
      { input: "Shorts Block 11 - LIFF", cleaned: "Shorts Block 11" },
      { input: "Under The Bypass (World Premiere) - LIFF", cleaned: "Under The Bypass" },
      { input: "Between Worlds (LPFF)", cleaned: "Between Worlds" },
      { input: "I'd do it All Over Again (LoLaFF)", cleaned: "I'd do it All Over Again" },
      { input: "Anina - LoLaFF", cleaned: "Anina" },
      { input: "Scaling The Eiffel Tower (LIFF)", cleaned: "Scaling The Eiffel Tower" },
      { input: "The Crowd (London Breeze Film Festival UK Premiere", cleaned: "The Crowd" },
      { input: "Man Baby (London Breeze Film Festival Preview", cleaned: "Man Baby" },
      { input: "Shorts Programme (London Breeze Film Festival)", cleaned: "Shorts Programme" },
    ]);
  });

  describe("festival and strand prefixes", () => {
    expectCleaned([
      { input: "LPFF 2026: Concrete Land", cleaned: "Concrete Land" },
      { input: "LPFF 2026 Short Session: Between Worlds", cleaned: "Between Worlds" },
      { input: "LPFF 2026 Closing Night: Conversation with the Sea", cleaned: "Conversation with the Sea" },
      { input: "London Palestine Film Festival 2026: Lovely Butterfly", cleaned: "Lovely Butterfly" },
      { input: "UKJFF 2026: The Sea", cleaned: "The Sea" },
      { input: "UKJFF: The Righteous Road Trip", cleaned: "The Righteous Road Trip" },
      { input: "HKFF 2026: Behind the Shadows", cleaned: "Behind the Shadows" },
      { input: "London Breeze Film Festival: Miss Jobson", cleaned: "Miss Jobson" },
      { input: "Doc’ n Roll Film Festival 2026: Frampton", cleaned: "Frampton" },
      { input: "Sheffield DocFest Spotlights: MKO", cleaned: "MKO" },
      { input: "HACKNEY CHILDREN'S FILM FEST: THE LITTLE VAMPIRE", cleaned: "THE LITTLE VAMPIRE" },
      { input: "Hackney Children’s Film Fest: THE WILD ROBOT", cleaned: "THE WILD ROBOT" },
      { input: "Classroom Cinema: The Staffroom", cleaned: "The Staffroom" },
      { input: "Babykino: The Shoshani Riddle", cleaned: "The Shoshani Riddle" },
      { input: "Members' Screening: The Social Reckoning", cleaned: "The Social Reckoning" },
      { input: "Centrepiece Gala: The Wedding Entertainer", cleaned: "The Wedding Entertainer" },
      { input: "Closing Night Gala: The Last Concert", cleaned: "The Last Concert" },
      { input: "Opening Night: The Journey to Gyeong-ju", cleaned: "The Journey to Gyeong-ju" },
      { input: "FFFL Opening Gala - A Woman's Life", cleaned: "A Woman's Life" },
      { input: "Odyssey 2026: The Last Emperor", cleaned: "The Last Emperor" },
      { input: "Screening - Dune: Part Three", cleaned: "Dune: Part Three" },
      { input: "Crafty Movie Night - Corpse Bride", cleaned: "Corpse Bride" },
      { input: "Girl, So Cinema Club: Sense and Sensibility", cleaned: "Sense and Sensibility" },
      { input: "Evolution of Horror Presents: Sinners", cleaned: "Sinners" },
      { input: "We Are Doc Women presents: Ghost Town plus Q&A", cleaned: "Ghost Town" },
      { input: "CineCarib presents Fanon", cleaned: "Fanon" },
      { input: "Peer presents One Hundred Faces for a Single Day", cleaned: "One Hundred Faces for a Single Day" },
      { input: "presents MIRACLE MILE", cleaned: "MIRACLE MILE" },
      // The source of those "presents …" leftovers: the Bar Trash rule used to
      // stop before "presents", so a second clean gave a different answer.
      { input: "BAR TRASH presents The Robe", cleaned: "The Robe" },
      { input: "BAR TRASH presents BLACKMAIL (1929)", cleaned: "BLACKMAIL", year: 1929 },
    ]);
  });

  describe("format suffixes", () => {
    expectCleaned([
      { input: "ERASERHEAD (16mm)", cleaned: "ERASERHEAD" },
      { input: "Heat (35mm)", cleaned: "Heat" },
      { input: "The Odyssey (70mm)", cleaned: "The Odyssey" },
      { input: "Steel of Film (35 mm)", cleaned: "Steel of Film" },
      { input: "The Hart of London (1970) on 16mm", cleaned: "The Hart of London", year: 1970 },
      { input: "THE MAD BOMBER (ON 16MM)", cleaned: "THE MAD BOMBER" },
      { input: "THE UNKNOWN (ON 16MM", cleaned: "THE UNKNOWN" },
      { input: "COP (VHS)", cleaned: "COP" },
      { input: "Avengers: Endgame (Re-release)", cleaned: "Avengers: Endgame" },
      { input: "28 Days Later... (Re-release)", cleaned: "28 Days Later..." },
      { input: "ParaNorman (Remastered)", cleaned: "ParaNorman" },
      { input: "Alien (Theatrical Cut)", cleaned: "Alien" },
      { input: "Possession (North American Cut)", cleaned: "Possession" },
      { input: "Blade (4K reissue)", cleaned: "Blade" },
      { input: "24 Hour Party People (4K Re-release)", cleaned: "24 Hour Party People" },
      { input: "Wake in Fright - 4K Restoration", cleaned: "Wake in Fright" },
      { input: "Halloween 4K Restoration", cleaned: "Halloween" },
      { input: "Sexy Beast- 4K Restoration", cleaned: "Sexy Beast" },
      { input: "La Boum 4K - FFFL", cleaned: "La Boum" },
      { input: "For Sale (A vendre) 4K", cleaned: "For Sale (A vendre)" },
      { input: "For Sale (A vendre) 4K + extended intro FFFL", cleaned: "For Sale (A vendre)" },
      { input: "Nadja • 4K Restoration • London Premiere", cleaned: "Nadja" },
    ]);
  });

  describe("extras", () => {
    expectCleaned([
      { input: "Her Private Hell + Recorded Intro", cleaned: "Her Private Hell" },
      { input: "Tongues Untied + pre-recorded intro by writer Jason Okundaye", cleaned: "Tongues Untied" },
      { input: "Extra Geography + extended intro with director Molly Manners", cleaned: "Extra Geography" },
      { input: "Life Support + Director Introduction", cleaned: "Life Support" },
      { input: "Naza + Q+A", cleaned: "Naza" },
      { input: "Ghost Town plus Director Q&A", cleaned: "Ghost Town" },
      { input: "The Estate + Panel Discussion", cleaned: "The Estate" },
      { input: "Cactus Pears + ScreenTalk", cleaned: "Cactus Pears" },
      { input: "CANDYMAN + Book Launch", cleaned: "CANDYMAN" },
      { input: "Nosferatu with Live Score", cleaned: "Nosferatu" },
      { input: "The Cabinet of Dr. Caligari (Live Score)", cleaned: "The Cabinet of Dr. Caligari" },
      { input: "Wicker - Preview", cleaned: "Wicker" },
      { input: "Sinners - Black History Month 2026", cleaned: "Sinners" },
      { input: "Wolfwalkers I Trans Awareness programme 2026", cleaned: "Wolfwalkers" },
      { input: "Everything Must Go Edition w/ Bonus Footage", cleaned: "Everything Must Go" },
      { input: "Donnie Darko 25th Anniversary", cleaned: "Donnie Darko" },
      { input: "Terminator 2: Judgment Day 35th Anniversary", cleaned: "Terminator 2: Judgment Day" },
      { input: "Charlie and Lola – 25th Anniversary", cleaned: "Charlie and Lola" },
      { input: "The Transformers: The Movie: 40th Anniversary", cleaned: "The Transformers: The Movie" },
      { input: "Casino Royale (20th Anniversary", cleaned: "Casino Royale" },
      { input: "24 Hour Party People - (24 Year Anniversary)", cleaned: "24 Hour Party People" },
      { input: "It's Nice Up North (20th Anniversary) + Q+A", cleaned: "It's Nice Up North" },
      { input: "House of Usher (aka The Fall of the House of Usher)", cleaned: "House of Usher" },
      { input: "Noose (aka The Silk Noose)", cleaned: "Noose" },
    ]);
  });

  describe("glued premiere prefix", () => {
    expectCleaned([
      { input: "UK PREMIEREThe Night is Fading Away", cleaned: "The Night is Fading Away" },
    ]);

    it("records the glued premiere as the stripped prefix", () => {
      expect(cleanFilmTitleWithMetadata("UK PREMIEREThe Night is Fading Away").strippedPrefix).toBe("UK PREMIERE");
    });
  });

  describe("opera season prefixes", () => {
    expectCleaned([
      { input: "Met Opera 2026-27: Tosca", cleaned: "Tosca" },
      { input: "Met Opera: Tosca", cleaned: "Tosca" },
      { input: "RBO Encore 2026-27: Manon", cleaned: "Manon" },
      { input: "2026-27: La Fanciulla del West", cleaned: "La Fanciulla del West" },
      { input: "Live 2026-27: Gotterdammerung", cleaned: "Gotterdammerung" },
      // The venue's own typo for the 2026-27 season
      { input: "2026-26: Silent Night", cleaned: "Silent Night" },
      { input: "Live 2026-26: Silent Night", cleaned: "Silent Night" },
    ]);
  });

  describe("real titles that share words with the new rules survive", () => {
    const preserved = [
      "28 Days Later...",
      "Nosferatu",
      "The Odyssey",
      "Casino Royale",
      "Mission: Impossible – Dead Reckoning",
      "Alien: Romulus",
      "Dune: Part Three",
      "Ghost Town",
      "Live and Let Die",
      "Opening Night",
      "Preview",
      "The Party",
      "30th Anniversary",
      "2001: A Space Odyssey",
      "Blade Runner 2049",
      "Christmas Presents",
      "Peer Gynt",
      "Screening Technology, Theorizing Posthumanism",
      "The Meaning of Liff",
      "Riff Raff",
      "Halloween",
      "Madame",
      "Members Only",
      "Silent Night",
      "Live Flesh",
      "24 Hour Party People",
      "The Night is Fading Away",
    ];

    for (const title of preserved) {
      it(`preserves "${title}"`, () => {
        expect(cleanFilmTitle(title)).toBe(title);
      });
    }

    it("keeps a double bill's second year in the title once its extra is stripped", () => {
      const result = cleanFilmTitleWithMetadata(
        "Speak (1962) and The Committee (1968) + Introduction by series curator Sophia Satchell-Baeza",
      );
      expect(result.cleanedTitle).toBe("Speak (1962) and The Committee (1968)");
      expect(result.extractedYear).toBeUndefined();
    });

    it("leaves a bulleted double bill whole, so the second film's year never becomes the hint", () => {
      const input = "Halloween (1978) + Halloween II (1981) • Double Feature";
      const result = cleanFilmTitleWithMetadata(input);
      expect(result.cleanedTitle).toBe(input);
      expect(result.extractedYear).toBeUndefined();
    });

    it("keeps Frankenstein's release year as a hint", () => {
      const result = cleanFilmTitleWithMetadata("Frankenstein (1931)");
      expect(result.cleanedTitle).toBe("Frankenstein");
      expect(result.extractedYear).toBe(1931);
    });
  });

  describe("programme strands, part markers and guest credits", () => {
    expectCleaned([
      { input: "Black History Month 2026: Sinners", cleaned: "Sinners" },
      { input: "Black History Month: Cotton Queen", cleaned: "Cotton Queen" },
      { input: "Liberté (Pt2)", cleaned: "Liberté" },
      { input: "Résistance (Pt1)", cleaned: "Résistance" },
      { input: "Resistance - part1", cleaned: "Resistance" },
      { input: "Liberte - part 2", cleaned: "Liberte" },
      { input: "The Invite (BIA)", cleaned: "The Invite" },
      { input: "Toy Story 5 (BIA)", cleaned: "Toy Story 5" },
      { input: "Special Preview of Fatherland with Katja Hoyer", cleaned: "Fatherland" },
      { input: "Special Preview of Fatherland", cleaned: "Fatherland" },
      { input: "Preview of Fatherland", cleaned: "Fatherland" },
      // A one-word "guest" is part of the title
      { input: "Special Preview of Dances with Wolves", cleaned: "Dances with Wolves" },
      { input: "Ken Russell's The Devils: The Director's Cut", cleaned: "The Devils" },
      { input: "Brazil: Director's Cut", cleaned: "Brazil" },
      { input: "Dry Leaf + Q&A TBC", cleaned: "Dry Leaf" },
      { input: "Portrait of Jason + intro + live poetry", cleaned: "Portrait of Jason" },
      { input: "CAMP CLASSICS presents BLOWIE (+Q&A)", cleaned: "BLOWIE" },
      { input: "Persona + Introduction by Ronja Blight", cleaned: "Persona" },
      { input: "THE SECRET AGENT + Talk presented by MUBI and PINTS OF KNOWLEDGE", cleaned: "THE SECRET AGENT" },
      { input: "Gunnera + Introduction film critic Henry K. Miller", cleaned: "Gunnera" },
      { input: "Daleks’ Invasion Earth 2150 A.D. + Introduction and Book Signing by Lillian Crawford", cleaned: "Daleks’ Invasion Earth 2150 A.D." },
      { input: "Köln 75 + ScreenTalk...", cleaned: "Köln 75" },
      { input: "Girls Like Girls + Q+A with Hayley Kiyoko", cleaned: "Girls Like Girls" },
    ]);

    // Canonical sequel naming carries the film's identity, so it stays. The
    // part rule only takes abbreviated "(Pt2)" and lowercase "- part 2" after
    // a title that does not end in a number.
    const preserved = [
      "Mockingjay - Part 2",
      "Che - Part 2",
      "Humpty Dumpty X - PART 1",
      "Dune: Part Two",
      "Kill Bill: Vol. 2",
      "Harry Potter and the Deathly Hallows: Part 2",
      "Part 2",
      "Toy Story 5 (Pt1)",
      // Possessive credits stay unless the title is a director's cut: TMDB
      // keeps some as part of the title.
      "Lee Cronin's The Mummy",
      "Ken Russell's The Devils",
      "Bram Stoker's Dracula",
      "Mary Shelley's Frankenstein",
      "Rob Zombie's Halloween",
      "Schindler's List",
      "Ferris Bueller's Day Off",
      "The Devil's Backbone",
      "Apocalypse Now: Final Cut",
      // Double bills whose second film starts like an extra
      "Tony Takitani + Talk Radio",
      "Volver + Talk to Her",
      "Serpico + Q & A Nights",
    ];

    for (const title of preserved) {
      it(`preserves "${title}"`, () => {
        expect(cleanFilmTitle(title)).toBe(title);
      });
    }
  });
});

describe("idempotency over the 534 unmatched titles of 2026-10-04", () => {
  it("cleaning a cleaned title changes nothing", () => {
    expect(unmatchedTitles).toHaveLength(534);
    const unstable = unmatchedTitles
      .map((title) => ({ title, once: cleanFilmTitle(title) }))
      .filter(({ once }) => cleanFilmTitle(once) !== once);
    expect(unstable).toEqual([]);
  });
});
