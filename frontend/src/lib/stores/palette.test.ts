/**
 * Palette store smoke tests.
 *
 * The store relies on Svelte 5 runes (`$state`, `$derived`) which only
 * compile under svelte-check / Vite. Vitest in node mode can't import
 * `.svelte.ts` modules directly because the rune syntax isn't valid TS.
 *
 * For now we test the parser (the only pure logic with non-trivial
 * branches) and rely on svelte-check + integration tests in step 10 for
 * the store. This stub exists so the test runner doesn't grep an empty
 * stores/ directory and so any future pure helpers added here get a
 * landing pad.
 */

import { describe, it, expect } from "vitest";
import { parseQuery } from "$lib/search/parse-query";

describe("palette store — sanity", () => {
  it("parses a query (parser module reachable from stores dir)", () => {
    const r = parseQuery("tonight", new Date("2026-05-14T12:00:00Z"));
    expect(r.dateFrom).toBeDefined();
  });
});
