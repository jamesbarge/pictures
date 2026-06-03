import { describe, it, expect } from "vitest";
import { parseSearchResultsArray } from "./bfi-parse";

/**
 * Covers the load-bearing bracket-walker in parseSearchResultsArray: it must
 * find the `searchResults : [ ... ]` array and walk to the MATCHING close
 * bracket while ignoring brackets that appear inside quoted strings.
 *
 * mapRows() is currently instance-coupled (uses this.venue/this.config); a
 * pure-extraction refactor to unit-test its row→screening mapping (incl. the
 * 0-indexed-month guard) is tracked as a follow-up.
 */
describe("parseSearchResultsArray", () => {
  it("parses a flat array of rows", () => {
    const html = `var x = { searchResults : [["Akira", 1988], ["Ran", 1985]] };`;
    expect(parseSearchResultsArray(html)).toEqual([["Akira", 1988], ["Ran", 1985]]);
  });

  it("handles NESTED arrays without terminating early at an inner ]", () => {
    const html = `searchResults : [["A", 1, ["x", "y"]], ["B", 2]]`;
    const rows = parseSearchResultsArray(html);
    expect(rows).toHaveLength(2);
    expect(rows![0]).toEqual(["A", 1, ["x", "y"]]);
  });

  it("does NOT treat a bracket inside a quoted string as structural", () => {
    const html = `searchResults : [["Title with [brackets] inside", 1]]`;
    const rows = parseSearchResultsArray(html);
    expect(rows).toHaveLength(1);
    expect(rows![0][0]).toBe("Title with [brackets] inside");
  });

  it("handles escaped quotes inside strings", () => {
    const html = `searchResults : [["He said \\"hi\\" ]", 3]]`;
    const rows = parseSearchResultsArray(html);
    expect(rows).toHaveLength(1);
    expect(rows![0][0]).toBe('He said "hi" ]');
  });

  it("returns null when the searchResults token is absent", () => {
    expect(parseSearchResultsArray(`<html>no results here</html>`)).toBeNull();
  });

  it("returns null on an unbalanced (truncated) array", () => {
    expect(parseSearchResultsArray(`searchResults : [["A", 1], `)).toBeNull();
  });

  it("returns null when the bracket-balanced slice is not valid JSON", () => {
    // Balanced brackets, but single-quotes/bareword make it invalid JSON.
    expect(parseSearchResultsArray(`searchResults : ['A', not_json]`)).toBeNull();
  });
});
