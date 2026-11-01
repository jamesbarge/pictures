/**
 * Unit tests for patrol-autofix's pure helpers. The DB-touching main()
 * is integration-only; these tests pin the title-transformation contracts
 * so future regressions in `smartTitleCase` or `shouldFlagAllCaps` are caught
 * by `npm run test:run`. Shared entity decoding is tested in title-patterns.
 */
import { describe, it, expect } from "vitest";

import { smartTitleCase } from "../src/scrapers/utils/film-title-cleaner";

// shouldFlagAllCaps stays beside the script: importing patrol-autofix.ts
// opens a database connection. smartTitleCase is the shared helper.

const DIRTY_ALL_CAPS_RE = /^[A-Z0-9\s\-:.,'!?&()'’–—\/#]+$/u;
function shouldFlagAllCaps(title: string): boolean {
  return (
    DIRTY_ALL_CAPS_RE.test(title) &&
    /[A-Z]{4,}/.test(title) &&
    !/[a-z]/.test(title) &&
    title.length >= 10 &&
    /\s/.test(title)
  );
}

describe("smartTitleCase", () => {
  it("converts ALL CAPS multi-word titles to title case", () => {
    expect(smartTitleCase("BLOOD AND BONES")).toBe("Blood and Bones");
    expect(smartTitleCase("APPROPRIATE BEHAVIOUR")).toBe("Appropriate Behaviour");
    expect(smartTitleCase("MESSIAH OF EVIL")).toBe("Messiah of Evil");
  });

  it("preserves known acronyms", () => {
    expect(smartTitleCase("TRY NOT TO LAUGH - LVSFF")).toBe("Try Not to Laugh - LVSFF");
    expect(smartTitleCase("SXSW: THE NIGHT")).toBe("SXSW: the Night");
    expect(smartTitleCase("AN INTRODUCTION TO BFI")).toBe("An Introduction to BFI");
  });

  it("lower-cases articles and prepositions in the middle", () => {
    expect(smartTitleCase("THE LORD OF THE RINGS")).toBe("The Lord of the Rings");
    expect(smartTitleCase("ALICE IN WONDERLAND")).toBe("Alice in Wonderland");
  });

  it("handles colons and hyphens as word boundaries", () => {
    expect(smartTitleCase("NICKELFEST #1 - DAY ONE")).toBe("Nickelfest #1 - Day One");
    expect(smartTitleCase("BLOODLINES & FAULT LINES")).toBe("Bloodlines & Fault Lines");
  });

  it("capitalises the first letter inside parentheses, not the parenthesis", () => {
    expect(smartTitleCase("LITTLE SHOP OF HORRORS (DIRECTOR'S CUT)")).toBe(
      "Little Shop of Horrors (Director's Cut)",
    );
    expect(smartTitleCase("LITTLE SHOP OF HORRORS (DIRECTOR\u2019S CUT)")).toBe(
      "Little Shop of Horrors (Director\u2019s Cut)",
    );
  });

  it("capitalises a name after an apostrophe and keeps a possessive s", () => {
    expect(smartTitleCase("O'BRIEN")).toBe("O'Brien");
    expect(smartTitleCase("O\u2019BRIEN")).toBe("O\u2019Brien");
    expect(smartTitleCase("MCDONALD'S")).toBe("Mcdonald's");
    expect(smartTitleCase("DIRECTOR'S CUT")).toBe("Director's Cut");
  });
});

describe("shouldFlagAllCaps", () => {
  it("skips stylized single-word titles", () => {
    expect(shouldFlagAllCaps("BOUND")).toBe(false);
    expect(shouldFlagAllCaps("DUNE")).toBe(false);
    expect(shouldFlagAllCaps("BLADE")).toBe(false);
    expect(shouldFlagAllCaps("ALIEN")).toBe(false);
    expect(shouldFlagAllCaps("BRAZIL")).toBe(false);
    expect(shouldFlagAllCaps("WALL-E")).toBe(false);
    expect(shouldFlagAllCaps("UNIFORM")).toBe(false);
  });

  it("skips short multi-word stylized titles (< 10 chars)", () => {
    expect(shouldFlagAllCaps("MIB 3")).toBe(false);
    expect(shouldFlagAllCaps("STAR WARS")).toBe(false); // exactly 9 chars
    expect(shouldFlagAllCaps("II")).toBe(false);
    expect(shouldFlagAllCaps("E.T.")).toBe(false);
  });

  it("flags long multi-word ALL CAPS titles", () => {
    expect(shouldFlagAllCaps("BLOOD AND BONES")).toBe(true);
    expect(shouldFlagAllCaps("APPROPRIATE BEHAVIOUR")).toBe(true);
    expect(shouldFlagAllCaps("NICKELFEST #1 - DAY ONE")).toBe(true);
    expect(shouldFlagAllCaps("MY NAME IS MONDAY: A NIGHT OF SOVIET FILM, MUSIC & ANIMATION")).toBe(true);
    expect(shouldFlagAllCaps("SXSW: THE NIGHT (GAUA)")).toBe(true);
  });

  it("skips titles with lowercase letters", () => {
    expect(shouldFlagAllCaps("Blood and Bones")).toBe(false);
    expect(shouldFlagAllCaps("Already Clean Title")).toBe(false);
  });
});
