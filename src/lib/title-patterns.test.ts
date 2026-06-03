import { describe, expect, it } from "vitest";
import {
  cleanBasicCruft,
  decodeHtmlEntities,
  isLikelyCleanTitle,
} from "./title-patterns";

describe("isLikelyCleanTitle", () => {
  it("returns true for a plain film title", () => {
    expect(isLikelyCleanTitle("Vertigo")).toBe(true);
  });

  it("returns true for a multi-word plain film title", () => {
    expect(isLikelyCleanTitle("The Lord of the Rings")).toBe(true);
  });

  it("returns false for event prefix: 'Saturday Morning Picture Club: X'", () => {
    expect(
      isLikelyCleanTitle("Saturday Morning Picture Club: Song of the Sea"),
    ).toBe(false);
  });

  it("returns false for UK Premiere prefix", () => {
    expect(isLikelyCleanTitle("UK Premiere: The Brutalist")).toBe(false);
  });

  it("returns false for 35mm prefix", () => {
    expect(isLikelyCleanTitle("35mm: The Shining")).toBe(false);
  });

  it("returns false for 4K Restoration prefix", () => {
    expect(isLikelyCleanTitle("4K: 2001 A Space Odyssey")).toBe(false);
  });

  it("returns false for Q&A suffix", () => {
    expect(isLikelyCleanTitle("Anatomy of a Fall + Q&A")).toBe(false);
  });

  it("returns false for 'with Shadow Cast' suffix", () => {
    expect(isLikelyCleanTitle("Rocky Horror with Shadow Cast")).toBe(false);
  });

  it("returns false for '+ Discussion' suffix", () => {
    expect(isLikelyCleanTitle("La Chimera + Discussion")).toBe(false);
  });

  it("returns false for a short prefix before colon (non-franchise)", () => {
    // 2 words before colon, not a known franchise — suspicious.
    expect(isLikelyCleanTitle("Cinema Lab: Dune")).toBe(false);
  });

  it("returns true for known franchise prefix before colon: 'Star Wars'", () => {
    expect(isLikelyCleanTitle("Star Wars: A New Hope")).toBe(true);
  });

  it("returns true for known franchise prefix before colon: 'Harry Potter'", () => {
    expect(
      isLikelyCleanTitle("Harry Potter: and the Prisoner of Azkaban"),
    ).toBe(true);
  });

  it("returns true for known franchise prefix before colon: 'Lord of the Rings'", () => {
    expect(
      isLikelyCleanTitle("Lord of the Rings: The Fellowship of the Ring"),
    ).toBe(true);
  });

  it("returns true when colon appears with > 2 words before it (likely a real subtitle)", () => {
    // The short-prefix check is `<= 2 words`. Three or more before colon
    // passes the check on the assumption it's a real subtitled title.
    expect(isLikelyCleanTitle("The Long Goodbye: A Restoration")).toBe(true);
  });

  it("returns false for kids/family prefixed events", () => {
    expect(isLikelyCleanTitle("Kids Club: Paddington")).toBe(false);
    expect(isLikelyCleanTitle("Family Film: Frozen")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(
      isLikelyCleanTitle("SATURDAY MORNING PICTURE CLUB: SONG OF THE SEA"),
    ).toBe(false);
  });
});

describe("cleanBasicCruft", () => {
  it("trims whitespace", () => {
    expect(cleanBasicCruft("  The Godfather  ")).toBe("The Godfather");
  });

  it("collapses internal whitespace", () => {
    expect(cleanBasicCruft("The   Godfather")).toBe("The Godfather");
  });

  it("strips trailing '+ Q&A'", () => {
    expect(cleanBasicCruft("Anatomy of a Fall + Q&A")).toBe(
      "Anatomy of a Fall",
    );
  });

  it("strips '+ Q&amp;A' (HTML-encoded ampersand)", () => {
    expect(cleanBasicCruft("Anatomy of a Fall + Q&amp;A")).toBe(
      "Anatomy of a Fall",
    );
  });

  it("strips '+ Intro' suffix", () => {
    expect(cleanBasicCruft("La Chimera + Intro by Director")).toBe(
      "La Chimera",
    );
  });

  it("strips 4K Restoration tag", () => {
    expect(cleanBasicCruft("Vertigo (4K Restoration)")).toBe("Vertigo");
  });

  it("strips Director's Cut tag", () => {
    expect(cleanBasicCruft("Blade Runner (Director's Cut)")).toBe(
      "Blade Runner",
    );
  });

  it("strips BBFC rating in parentheses at end", () => {
    expect(cleanBasicCruft("The Brutalist (15)")).toBe("The Brutalist");
    expect(cleanBasicCruft("Paddington (PG)")).toBe("Paddington");
    expect(cleanBasicCruft("Saltburn (18)")).toBe("Saltburn");
  });

  it("strips 35mm/70mm/4K/IMAX format suffix with leading dash", () => {
    expect(cleanBasicCruft("The Shining - 35mm")).toBe("The Shining");
    expect(cleanBasicCruft("Inception - IMAX")).toBe("Inception");
  });

  it("strips bracketed notes at end", () => {
    expect(cleanBasicCruft("Oppenheimer [SOLD OUT]")).toBe("Oppenheimer");
  });

  it("strips 'TBC' suffix", () => {
    expect(cleanBasicCruft("Mystery Film TBC")).toBe("Mystery Film");
  });

  it("strips '+ Pajama Party' suffix", () => {
    expect(cleanBasicCruft("The Princess Bride + Pajama Party")).toBe(
      "The Princess Bride",
    );
  });

  it("strips Anniversary suffix", () => {
    expect(cleanBasicCruft("Pulp Fiction - 30th Anniversary")).toBe(
      "Pulp Fiction",
    );
  });

  it("strips Encore suffix", () => {
    expect(cleanBasicCruft("Met Opera: Aida Encore")).toBe("Met Opera: Aida");
  });

  it("is idempotent on already-clean titles", () => {
    expect(cleanBasicCruft("Citizen Kane")).toBe("Citizen Kane");
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes &amp; to &", () => {
    expect(decodeHtmlEntities("Salt &amp; Pepper")).toBe("Salt & Pepper");
  });

  it("decodes &quot; to double quote", () => {
    expect(decodeHtmlEntities("&quot;The Long Goodbye&quot;")).toBe(
      '"The Long Goodbye"',
    );
  });

  it("decodes &#39; to apostrophe", () => {
    expect(decodeHtmlEntities("Ocean&#39;s Eleven")).toBe("Ocean's Eleven");
  });

  it("decodes &lt; and &gt; to angle brackets", () => {
    expect(decodeHtmlEntities("&lt;Untitled&gt;")).toBe("<Untitled>");
  });

  it("decodes multiple entities in one string", () => {
    expect(decodeHtmlEntities("Salt &amp; Pepper &amp; Eggs")).toBe(
      "Salt & Pepper & Eggs",
    );
  });

  it("leaves non-encoded text unchanged", () => {
    expect(decodeHtmlEntities("Plain Title")).toBe("Plain Title");
  });

  it("does NOT decode other entities (only the 5 explicit ones)", () => {
    // The function does not use a generic HTML entity decoder — only the
    // 5 patterns above. `&nbsp;` and named entities are left alone.
    // Pinning this so future callers know to NOT rely on full decoding.
    expect(decodeHtmlEntities("Cool&nbsp;Title")).toBe("Cool&nbsp;Title");
    expect(decodeHtmlEntities("Caf&eacute;")).toBe("Caf&eacute;");
  });
});
