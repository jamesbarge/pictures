/**
 * Sequel-safe matching: regression tests for the 2026-09-09 run.
 *
 * These drive the REAL `findMatchingFilm` entry point with only the DB edge
 * mocked, so the candidate loop, the length-aware threshold, the year window
 * and the sequel guard all run as production code. Every case below is either
 * an observed event from
 * `tmp/scrape-logs/scrape-full-20260909-221554.log` or a real row pair from the
 * films table, so none of it is invented shape.
 *
 * The `pgRows` fixture stands in for the pg_trgm query, which is the only leaf
 * this module touches.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/** Rows the mocked pg_trgm query will return, in production column shape. */
let pgRows: Array<{
  id: string;
  title: string;
  year: number | null;
  tmdb_id: number | null;
  similarity: number;
}> = [];

vi.mock("@/db", () => ({
  db: {
    execute: async () => pgRows,
  },
}));

import {
  disagreesOnTrailingNumber,
  findMatchingFilm,
  sequelMarkerOf,
  trailingNumberOf,
} from "./film-similarity";

function row(
  title: string,
  similarity: number,
  year: number | null = null,
  id = `id-${title}-${year ?? "null"}`,
) {
  return { id, title, year, tmdb_id: null, similarity };
}

beforeEach(() => {
  pgRows = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// The two events named in the brief, reproduced through the real entry point
// ---------------------------------------------------------------------------

describe("the observed unsafe matches", () => {
  it('refuses "Practical Magic 2" → "Practical Magic" when no source year is known', async () => {
    // 27 of the run's 36 acceptances logged no year rejection at all: with no
    // usable source year violatesYearWindow cannot fire, and 89% clears the
    // 3-word 0.78 bar unopposed.
    pgRows = [row("Practical Magic", 0.89, 1998, "5560542a")];

    await expect(findMatchingFilm("Practical Magic 2", null)).resolves.toBeNull();
  });

  it("refuses the NULL-year duplicate that the year guard could not reject", async () => {
    // 9 of the 36 acceptances came on the line straight after a year
    // rejection. Both rows here are real (ids 5560542a and 81fa3c8d), and this
    // asserts what the CODE does with that pair: the 1998 row is refused on
    // year and the NULL-year one cannot be, because violatesYearWindow needs a
    // year on both sides. Which row the run's acceptances actually took is not
    // established by the log.
    pgRows = [
      row("Practical Magic", 0.89, 1998, "5560542a"),
      row("Practical Magic", 0.89, null, "81fa3c8d"),
    ];

    await expect(findMatchingFilm("Practical Magic 2", 2026)).resolves.toBeNull();
  });

  it('refuses "Rob Zombie\'s Halloween II" → "Rob Zombie\'s Halloween"', async () => {
    pgRows = [row("Rob Zombie's Halloween", 0.88, 2007, "287dd7ab")];

    await expect(findMatchingFilm("Rob Zombie's Halloween II", null)).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The other unsafe sequel-shaped matches from the same run
// ---------------------------------------------------------------------------

describe("other unsafe matches observed in the same run", () => {
  it('refuses "Mockingjay - Part 2" → "Mockingjay - Part 1"', async () => {
    pgRows = [row("Mockingjay - Part 1", 0.8)];
    await expect(findMatchingFilm("Mockingjay - Part 2", null)).resolves.toBeNull();
  });

  it('refuses "The Bill Reunion 17" → "The Bill Reunion 16"', async () => {
    pgRows = [row("The Bill Reunion 16", 0.82)];
    await expect(findMatchingFilm("The Bill Reunion 17", null)).resolves.toBeNull();
  });

  it("refuses a bare base title against a Part-numbered candidate", async () => {
    // "Satyajit Ray Short Film Competition" → "… Part 1" (85%). The source has
    // no marker and the candidate has one, which is still a difference.
    pgRows = [row("Satyajit Ray Short Film Competition Part 1", 0.85)];
    await expect(
      findMatchingFilm("Satyajit Ray Short Film Competition", null),
    ).resolves.toBeNull();
  });

  it('refuses "SCREEN IN USE - 45" → "Screen in Use - 30"', async () => {
    pgRows = [row("Screen in Use - 30", 0.7)];
    await expect(findMatchingFilm("SCREEN IN USE - 45", null)).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Positive cases: the guard must not break these
// ---------------------------------------------------------------------------

describe("matches that must survive the guard", () => {
  it('keeps "Toy Story 5 (BIA)" → "Toy Story 5"', async () => {
    // Observed at 75% in the run and CORRECT — "(BIA)" is a baby-in-arms tag,
    // not a different film. Both sides carry marker 5.
    pgRows = [row("Toy Story 5", 0.75, 2026, "toy-story-5")];
    await expect(findMatchingFilm("Toy Story 5 (BIA)", null)).resolves.toEqual({
      filmId: "toy-story-5",
      confidence: "high",
    });
  });

  it("keeps identical numbered titles matching each other", async () => {
    // Real duplicate rows in the films table: "Selected 16" ×2, "Toy Story 5" ×2.
    pgRows = [row("Selected 16", 1, null, "selected-16-a")];
    await expect(findMatchingFilm("Selected 16", null)).resolves.toEqual({
      filmId: "selected-16-a",
      confidence: "high",
    });
  });

  it("keeps a restoration suffix matching its base title", async () => {
    pgRows = [row("Blade Runner 2049", 0.85, 2017, "br2049")];
    await expect(
      findMatchingFilm("BLADE RUNNER 2049 (4K Restoration)", 2017),
    ).resolves.toEqual({ filmId: "br2049", confidence: "high" });
  });

  it("keeps an unnumbered title matching an unnumbered candidate", async () => {
    pgRows = [row("The Godfather", 0.9, 1972, "godfather")];
    await expect(findMatchingFilm("Godfather, The", 1972)).resolves.toEqual({
      filmId: "godfather",
      confidence: "high",
    });
  });

  it("treats Roman and Arabic renderings of the same instalment as equal", async () => {
    // "Halloween II" and "Halloween 2" are the same film differently rendered,
    // so the guard must compare VALUES, not literal strings.
    pgRows = [row("Halloween 2", 0.9, 1981, "halloween-2")];
    await expect(findMatchingFilm("Halloween II", 1981)).resolves.toEqual({
      filmId: "halloween-2",
      confidence: "high",
    });
  });

  it("does not treat a four-digit year inside a title as an instalment", async () => {
    // Otherwise "1917" and "2046" would carry markers and stop matching
    // themselves through decoration differences.
    pgRows = [row("1917", 0.95, 2019, "1917")];
    await expect(findMatchingFilm("1917 (70mm)", 2019)).resolves.toEqual({
      filmId: "1917",
      confidence: "high",
    });
  });
});

// ---------------------------------------------------------------------------
// Rejecting one candidate must not blind the loop to the next
// ---------------------------------------------------------------------------

describe("candidate iteration", () => {
  it("accepts a correct later candidate after rejecting a sequel mismatch", async () => {
    // The wrong-but-higher-scoring candidate is rejected on marker, and the
    // correctly numbered one behind it is still reached and returned.
    pgRows = [
      row("Rob Zombie's Halloween", 0.88, 2007, "wrong-no-marker"),
      row("Halloween II", 0.85, 2009, "right-marker-2"),
    ];

    await expect(findMatchingFilm("Halloween II", 2009)).resolves.toEqual({
      filmId: "right-marker-2",
      confidence: "high",
    });
  });

  it("still applies the year window to a later candidate", async () => {
    // Guard and year window compose: first rejected on marker, second on year.
    pgRows = [
      row("Scream 3", 0.9, 2000, "wrong-marker"),
      row("Scream 2", 0.9, 1930, "wrong-year"),
    ];
    await expect(findMatchingFilm("Scream 2", 1997)).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The extractor, unit level
// ---------------------------------------------------------------------------

describe("sequelMarkerOf", () => {
  it.each([
    ["Practical Magic 2", 2],
    ["Halloween II", 2],
    ["Scream 4", 4],
    ["Rocky V", 5],
    ["Mockingjay - Part 2", 2],
    ["Dune: Part Two", 2],
    ["Kill Bill Vol. 1", 1],
    ["Mission: Impossible III", 3],
    ["The Bill Reunion 17", 17],
    ["Screen in Use - 30", 30],
    ["Toy Story 5 (BIA)", 5],
    ["Sing 2 (Sing-Along)", 2],
  ])("reads %s as instalment %i", (title, expected) => {
    expect(sequelMarkerOf(title)).toBe(expected);
  });

  it.each([
    ["Practical Magic"],
    ["The Godfather"],
    // Four-digit years are part of the name, not an instalment.
    ["Blade Runner 2049"],
    ["1917"],
    ["2046"],
    // The whole title IS the numeral or letter — there is no base to attach an
    // instalment to. "X" (2022) and "M" (1931) are real films.
    ["X"],
    ["M"],
    ["II"],
    // A trailing date is not an instalment. Real run titles look like this.
    ["Baby Comptines 07/10/2026"],
    ["THE NICKEL'S HALLOWEEN MASH - DAY ONE 31/10"],
  ])("reads %s as having no instalment marker", (title) => {
    expect(sequelMarkerOf(title)).toBeNull();
  });
});

describe("disagreesOnTrailingNumber", () => {
  it("rejects a differing number in either direction", () => {
    expect(disagreesOnTrailingNumber("Practical Magic 2", "Practical Magic")).toBe(true);
    expect(disagreesOnTrailingNumber("Practical Magic", "Practical Magic 2")).toBe(true);
    expect(disagreesOnTrailingNumber("Scream 2", "Scream 3")).toBe(true);
  });

  it("permits equal numbers and both-absent numbers", () => {
    expect(disagreesOnTrailingNumber("Toy Story 5 (BIA)", "Toy Story 5")).toBe(false);
    expect(disagreesOnTrailingNumber("Halloween II", "Halloween 2")).toBe(false);
    expect(disagreesOnTrailingNumber("The Godfather", "Godfather, The")).toBe(false);
    expect(disagreesOnTrailingNumber("Selected 16", "Selected 16")).toBe(false);
  });
});

describe("a year in the name identifies the film without being an instalment", () => {
  it("reads Blade Runner 2049's year as a name-number, not instalment 2049", () => {
    // The two readings are deliberately separate: nothing should ever claim
    // this film is the 2049th Blade Runner.
    expect(sequelMarkerOf("Blade Runner 2049")).toBeNull();
    expect(trailingNumberOf("Blade Runner 2049")).toBe(2049);
  });

  it("still distinguishes Blade Runner 2049 from Blade Runner", async () => {
    pgRows = [row("Blade Runner", 0.8, 1982, "br1982")];
    await expect(findMatchingFilm("Blade Runner 2049", null)).resolves.toBeNull();
  });

  it("still distinguishes Blade Runner from Blade Runner 2049", async () => {
    pgRows = [row("Blade Runner 2049", 0.8, 2017, "br2049")];
    await expect(findMatchingFilm("Blade Runner", null)).resolves.toBeNull();
  });

  it("keeps a bare-numeral title matching itself through decoration", async () => {
    // "1917" and "2046" have no base title in front of the numeral, so they
    // carry no number at all and decoration differences still match.
    pgRows = [row("2046", 0.9, 2004, "n2046")];
    await expect(findMatchingFilm("2046 (35mm)", 2004)).resolves.toEqual({
      filmId: "n2046",
      confidence: "high",
    });
  });
});
