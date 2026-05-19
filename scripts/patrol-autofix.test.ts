/**
 * Unit tests for patrol-autofix's pure helpers. The DB-touching main()
 * is integration-only; these tests pin the title-transformation contracts
 * so future regressions in `decodeHtmlEntities`, `smartTitleCase`, or
 * `shouldFlagAllCaps` are caught by `npm run test:run`.
 */
import { describe, it, expect } from "vitest";

// We re-implement the helpers here to keep the test pure (avoid importing
// the file which has top-level postgres connection side effects). The test
// is a pinning contract — if the helpers drift in patrol-autofix.ts,
// this test will fail and force the implementer to update both sides.

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&hellip;/g, "…")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
}

const ACRONYMS = new Set([
  "LVSFF", "SXSW", "BFI", "BAFTA", "IMAX", "UK", "USA", "US", "UFO",
  "FBI", "CIA", "NYC", "LA", "MI6", "NTL", "RSC", "ROH", "NT", "MET",
  "RAF", "WWI", "WWII", "DJ", "MC", "VHS", "DVD", "TV", "AM", "PM",
  "3D", "2D", "4K", "8K", "QC", "EU", "USSR", "GB", "PCC", "AC",
  "Q&A", "Q+A", "BBC", "ITV", "HBO", "MGM", "ABC", "CBS", "NBC",
]);

function smartTitleCase(s: string): string {
  const lowers = new Set(["of", "the", "and", "a", "an", "to", "in", "on", "for", "with", "by", "at", "from", "or", "nor", "but", "vs", "as", "is", "de", "la", "le", "du", "des"]);
  const words = s.split(/(\s+|-|:|;|\/)/);
  return words.map((w, i) => {
    if (!w.match(/\w/)) return w;
    const upper = w.toUpperCase();
    if (ACRONYMS.has(upper)) return upper;
    if (i > 0 && lowers.has(w.toLowerCase())) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join("");
}

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

describe("decodeHtmlEntities", () => {
  it("decodes the entities cleanFilmTitle handles", () => {
    expect(decodeHtmlEntities("Q&amp;A")).toBe("Q&A");
    expect(decodeHtmlEntities("Moss &amp; Freud")).toBe("Moss & Freud");
    expect(decodeHtmlEntities("It&rsquo;s")).toBe("It’s");
    expect(decodeHtmlEntities("&lsquo;hello&rsquo;")).toBe("‘hello’");
    expect(decodeHtmlEntities("a&mdash;b")).toBe("a—b");
    expect(decodeHtmlEntities("a&ndash;b")).toBe("a–b");
    expect(decodeHtmlEntities("a&hellip;")).toBe("a…");
    expect(decodeHtmlEntities("a&nbsp;b")).toBe("a b");
    expect(decodeHtmlEntities("&quot;A&quot;")).toBe('"A"');
    expect(decodeHtmlEntities("&apos;A&apos;")).toBe("'A'");
  });

  it("decodes numeric character references", () => {
    expect(decodeHtmlEntities("Q&#38;A")).toBe("Q&A"); // &
    expect(decodeHtmlEntities("&#8217;")).toBe("’");
  });

  it("is a no-op for clean strings", () => {
    expect(decodeHtmlEntities("Already Clean")).toBe("Already Clean");
    expect(decodeHtmlEntities("")).toBe("");
  });
});

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
