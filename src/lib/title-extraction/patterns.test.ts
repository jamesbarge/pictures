import { describe, expect, it } from "vitest";
import {
  DOUBLE_FEATURE_PATTERN,
  FRANCHISE_PATTERN,
  PRESENTS_PATTERN,
  SINGALONG_PATTERN,
  escapeRegex,
} from "./patterns";

describe("PRESENTS_PATTERN", () => {
  it("matches 'X presents \"Title\"' and captures the title", () => {
    const match = `Funeral Parade presents "Saint Maud"`.match(PRESENTS_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("Saint Maud");
  });

  it("matches the verb 'present' (no s) as well", () => {
    const match = `Studio Lab present "Citizen Kane"`.match(PRESENTS_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("Citizen Kane");
  });

  it("matches smart-quote U+201C", () => {
    const match = `Reclaim presents “Mad Max”`.match(PRESENTS_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("Mad Max");
  });

  it("does NOT match titles without explicit 'presents' keyword", () => {
    expect(`Funeral Parade "Saint Maud"`.match(PRESENTS_PATTERN)).toBeNull();
  });

  it("does NOT match titles without surrounding quotes", () => {
    expect(`Funeral Parade presents Saint Maud`.match(PRESENTS_PATTERN)).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(`FUNERAL PARADE PRESENTS "saint maud"`.match(PRESENTS_PATTERN)).not.toBeNull();
  });
});

describe("SINGALONG_PATTERN", () => {
  it("matches 'Sing-A-Long-A Title'", () => {
    const match = "Sing-A-Long-A Mamma Mia".match(SINGALONG_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("Mamma Mia");
  });

  it("matches 'Sing-A-Long Title' (no trailing A)", () => {
    const match = "Sing-A-Long Frozen".match(SINGALONG_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("Frozen");
  });

  it("matches 'SingALongA Title' (no hyphens)", () => {
    const match = "SingALongA Mamma Mia".match(SINGALONG_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("Mamma Mia");
  });

  it("is case-insensitive", () => {
    expect("SING-A-LONG-A MAMMA MIA".match(SINGALONG_PATTERN)).not.toBeNull();
  });

  it("does NOT match a plain title without the prefix", () => {
    expect("Mamma Mia".match(SINGALONG_PATTERN)).toBeNull();
  });
});

describe("DOUBLE_FEATURE_PATTERN", () => {
  it("matches 'A + B' and captures the first film", () => {
    const match = "Pulp Fiction + Reservoir Dogs".match(DOUBLE_FEATURE_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("Pulp Fiction");
  });

  it("non-greedy capture: returns first film, not the entire LHS up to last +", () => {
    // Pattern uses (.+?) — non-greedy — so for triple features the first match
    // wins. Documenting via test.
    const match = "A + B + C".match(DOUBLE_FEATURE_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("A");
  });

  it("does NOT match strings without ' + ' separator", () => {
    expect("Pulp Fiction".match(DOUBLE_FEATURE_PATTERN)).toBeNull();
  });

  it("matches when whitespace around + is missing", () => {
    // Pattern uses \s* so `+` without spaces still matches.
    const match = "Pulp Fiction+Reservoir Dogs".match(DOUBLE_FEATURE_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("Pulp Fiction");
  });
});

describe("FRANCHISE_PATTERN", () => {
  it("matches 'Star Wars'", () => {
    expect(FRANCHISE_PATTERN.test("Star Wars: A New Hope")).toBe(true);
  });

  it("matches 'Harry'", () => {
    expect(FRANCHISE_PATTERN.test("Harry Potter and the Goblet of Fire")).toBe(
      true,
    );
  });

  it("matches 'Lord'", () => {
    expect(FRANCHISE_PATTERN.test("Lord of the Rings: The Two Towers")).toBe(
      true,
    );
  });

  it("matches 'Indiana'", () => {
    expect(FRANCHISE_PATTERN.test("Indiana Jones and the Last Crusade")).toBe(
      true,
    );
  });

  it("matches 'Spider' (case-insensitive)", () => {
    expect(FRANCHISE_PATTERN.test("SPIDER-MAN: Across the Spider-Verse")).toBe(
      true,
    );
  });

  it("does NOT match arbitrary titles", () => {
    expect(FRANCHISE_PATTERN.test("Vertigo")).toBe(false);
    expect(FRANCHISE_PATTERN.test("Citizen Kane")).toBe(false);
  });

  it("matches at start-of-string only (anchored)", () => {
    // Pattern starts with ^ — `The Star Wars Story` should NOT match.
    expect(FRANCHISE_PATTERN.test("The Star Wars Story")).toBe(false);
  });
});

describe("escapeRegex", () => {
  it("escapes regex metacharacters", () => {
    expect(escapeRegex("a.b")).toBe("a\\.b");
    expect(escapeRegex("a*b")).toBe("a\\*b");
    expect(escapeRegex("a+b")).toBe("a\\+b");
    expect(escapeRegex("a?b")).toBe("a\\?b");
    expect(escapeRegex("(a)")).toBe("\\(a\\)");
    expect(escapeRegex("[a]")).toBe("\\[a\\]");
    expect(escapeRegex("{a}")).toBe("\\{a\\}");
    expect(escapeRegex("a^b")).toBe("a\\^b");
    expect(escapeRegex("a$b")).toBe("a\\$b");
    expect(escapeRegex("a|b")).toBe("a\\|b");
    expect(escapeRegex("a\\b")).toBe("a\\\\b");
  });

  it("leaves plain alphanumeric strings unchanged", () => {
    expect(escapeRegex("abc123")).toBe("abc123");
  });

  it("produces a string usable in a new RegExp()", () => {
    // Real-world contract: the escaped string can be embedded in a regex.
    const userInput = "The Lord of the Rings (2001)";
    const escaped = escapeRegex(userInput);
    // Should match the original input as a literal substring.
    expect(new RegExp(escaped).test(userInput)).toBe(true);
    // And should NOT explode at construction time.
    expect(() => new RegExp(escaped)).not.toThrow();
  });

  it("handles empty string", () => {
    expect(escapeRegex("")).toBe("");
  });

  it("does NOT escape characters that are not metacharacters", () => {
    // Per the regex used (`[.*+?^${}()|[\]\\]`), a forward slash and hyphen
    // are not escaped. Pin this so callers know.
    expect(escapeRegex("a-b")).toBe("a-b");
    expect(escapeRegex("a/b")).toBe("a/b");
  });
});
