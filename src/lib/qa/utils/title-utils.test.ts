import { describe, expect, it } from "vitest";
import { normalizeTitle, parseRelativeDatetime } from "./title-utils";

describe("normalizeTitle", () => {
  it("lowercases the input", () => {
    expect(normalizeTitle("Vertigo")).toBe("vertigo");
  });

  it("strips a leading 'The ' (case-insensitive)", () => {
    expect(normalizeTitle("The Godfather")).toBe("godfather");
    expect(normalizeTitle("THE SHINING")).toBe("shining");
  });

  it("strips a trailing parenthetical (year, format tag, etc.)", () => {
    expect(normalizeTitle("Vertigo (1958)")).toBe("vertigo");
    expect(normalizeTitle("Saint Maud (4K Restoration)")).toBe("saint maud");
  });

  it("strips a trailing colon+subtitle", () => {
    expect(normalizeTitle("Blade Runner: 2049")).toBe("blade runner");
  });

  it("normalises smart single-quote (U+2019) to ASCII apostrophe (preserved by allowed-char class)", () => {
    // Smart `’` → `'`, which is in the allowed class `[\w\s'-]` so survives.
    expect(normalizeTitle("Ocean’s Eleven")).toBe("ocean's eleven");
  });

  it("normalises smart double-quotes to ASCII BUT then strips them (not in allowed-char class)", () => {
    // Smart `"` → straight `"`, but `"` is NOT in `[\w\s'-]` so it's then
    // stripped by the punctuation-removal pass. Pinning the surprising
    // 2-step sequence: smart-quote normalisation HAPPENS but the result is
    // stripped immediately after.
    expect(normalizeTitle("“Fight Club”")).toBe("fight club");
  });

  it("normalises en/em dash to ASCII hyphen", () => {
    expect(normalizeTitle("Spider–Man")).toBe("spider-man");
    expect(normalizeTitle("Spider—Man")).toBe("spider-man");
  });

  it("strips characters outside [\\w \\s ' -]", () => {
    expect(normalizeTitle("Hello? World!")).toBe("hello world");
  });

  it("collapses multiple spaces to single space", () => {
    expect(normalizeTitle("A   B    C")).toBe("a b c");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeTitle("  Vertigo  ")).toBe("vertigo");
  });

  it("composes transforms in order: 'The Lord of the Rings (2001): Fellowship!'", () => {
    // Trace: lowercase → the-strip → year-strip looks for `(...)$` (no match —
    // `(2001):` is mid-string) → colon-strip eats `: fellowship!` →
    // punctuation-strip removes `(` `)` `!` → result is "lord of the rings 2001"
    // Year is NOT stripped because the colon-strip ran AFTER year-strip
    // failed to anchor. Pinning the surprising interaction.
    expect(normalizeTitle("The Lord of the Rings (2001): Fellowship!")).toBe(
      "lord of the rings 2001",
    );
  });

  it("year-strip DOES fire when the year is at the very end (no colon-tail)", () => {
    // "(2001)" at end → year-strip catches it before colon-strip runs.
    expect(normalizeTitle("The Lord of the Rings (2001)")).toBe("lord of the rings");
  });
});

describe("parseRelativeDatetime", () => {
  const ref = new Date(2026, 4, 15, 0, 0, 0); // May 15, 2026 (Thu)

  it("parses 'Today HH:MM' to today's date at the given time", () => {
    const iso = parseRelativeDatetime("Today 14:30", ref);
    expect(iso).toBeTruthy();
    const dt = new Date(iso!);
    expect(dt.getMonth()).toBe(4); // May (0-indexed)
    expect(dt.getDate()).toBe(15);
    expect(dt.getHours()).toBe(14);
    expect(dt.getMinutes()).toBe(30);
  });

  it("parses 'Tomorrow HH:MM' to ref + 1 day", () => {
    const iso = parseRelativeDatetime("Tomorrow 19:00", ref);
    expect(iso).toBeTruthy();
    const dt = new Date(iso!);
    expect(dt.getDate()).toBe(16);
    expect(dt.getHours()).toBe(19);
  });

  it("parses 'Sat 17 May 21:45' to the named day in the same year", () => {
    const iso = parseRelativeDatetime("Sat 17 May 21:45", ref);
    expect(iso).toBeTruthy();
    const dt = new Date(iso!);
    expect(dt.getFullYear()).toBe(2026);
    expect(dt.getMonth()).toBe(4); // May
    expect(dt.getDate()).toBe(17);
  });

  it("rolls past dates to NEXT year when the month is more than 1 behind reference", () => {
    // ref = May 2026. "Jan" is month 0, ref.getMonth() = 4. 0 < 4-1 = 3 → true.
    const iso = parseRelativeDatetime("Mon 10 Jan 19:00", ref);
    expect(iso).toBeTruthy();
    const dt = new Date(iso!);
    expect(dt.getFullYear()).toBe(2027); // rolled forward
  });

  it("does NOT roll a same-or-recent month forward", () => {
    // "Apr" = month 3, ref.getMonth() = 4. 3 < 4-1 = 3 → false (3 < 3 is false).
    const iso = parseRelativeDatetime("Sun 5 Apr 19:00", ref);
    expect(iso).toBeTruthy();
    const dt = new Date(iso!);
    expect(dt.getFullYear()).toBe(2026); // stays in same year
  });

  it("returns null when input has no time component", () => {
    expect(parseRelativeDatetime("Today", ref)).toBeNull();
  });

  it("returns null when prefix is not 'today'/'tomorrow' AND not 'Day DD Mon' pattern", () => {
    expect(parseRelativeDatetime("nonsense 14:00", ref)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseRelativeDatetime("", ref)).toBeNull();
  });

  it("returns null for unrecognised month name", () => {
    expect(parseRelativeDatetime("Mon 10 Xyz 14:00", ref)).toBeNull();
  });
});
