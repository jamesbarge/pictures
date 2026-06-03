/**
 * Tests for `processTitle` from src/db/backfill-posters.ts.
 *
 * Pure title-extraction function used by the poster-backfill job. Mirrors
 * some logic from the scraper-side `cleanFilmTitleWithMetadata` but is a
 * separate code path with its own behaviours worth pinning.
 */
import { describe, expect, it } from "vitest";
import { processTitle } from "./backfill-posters";

describe("processTitle", () => {
  it("returns clean title with no changes for a plain film name", () => {
    const result = processTitle("Vertigo");
    expect(result.cleanedTitle).toBe("Vertigo");
    expect(result.isNonFilm).toBe(false);
    expect(result.isLiveBroadcast).toBe(false);
  });

  it("identifies non-film events and short-circuits early", () => {
    // Per the NON_FILM_PATTERNS check at the top.
    const result = processTitle("Quiz Night");
    expect(result.isNonFilm).toBe(true);
    expect(result.changes).toContain("Identified as non-film event");
  });

  it("decodes HTML entities (&amp; &quot; &#39;)", () => {
    const result = processTitle("Salt &amp; Pepper");
    expect(result.cleanedTitle).toContain("Salt & Pepper");
  });

  it("extracts the inner title from 'X presents \"Y\"' pattern", () => {
    const result = processTitle('Funeral Parade presents "Caravaggio"');
    expect(result.cleanedTitle).toBe("Caravaggio");
  });

  it("trims surrounding whitespace before processing", () => {
    const result = processTitle("   Vertigo   ");
    // After trim, the title is "Vertigo".
    expect(result.cleanedTitle).toBe("Vertigo");
  });

  it("returns null for extractedYear when no year is in the title", () => {
    const result = processTitle("Vertigo");
    expect(result.extractedYear).toBeNull();
  });

  it("returns changes array (empty or with messages, never undefined)", () => {
    const result = processTitle("Vertigo");
    expect(Array.isArray(result.changes)).toBe(true);
  });

  it("returns the full ProcessedTitle shape including all 6 fields", () => {
    const result = processTitle("Vertigo");
    expect(result).toHaveProperty("cleanedTitle");
    expect(result).toHaveProperty("extractedYear");
    expect(result).toHaveProperty("isNonFilm");
    expect(result).toHaveProperty("isLiveBroadcast");
    expect(result).toHaveProperty("isCompilation");
    expect(result).toHaveProperty("changes");
  });
});
