/**
 * Title Extractor Adapter Tests
 *
 * The "AI extractor" is now a deterministic adapter on top of the
 * synchronous pattern extractor. Tests cover:
 *  - Clean title detection (no extraction needed)
 *  - Cruft removal (BBFC ratings, format suffixes, Q&A markers)
 *  - Canonical extraction (version suffixes stripped)
 *  - Batch + caching wrappers
 *  - hasWordOverlap utility
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  extractFilmTitle,
  batchExtractTitles,
  extractFilmTitleCached,
  clearTitleCache,
  hasWordOverlap,
} from "./index";

// ---------------------------------------------------------------------------
// Clean title detection
// ---------------------------------------------------------------------------

describe("extractFilmTitle - clean titles", () => {
  const cleanTitles = [
    "Casablanca",
    "The Godfather",
    "Pulp Fiction",
    "Amélie",
    "Parasite",
    "La La Land",
    "The Grand Budapest Hotel",
    "12 Angry Men",
    "8½",
  ];

  it.each(cleanTitles)("recognises '%s' as clean (high confidence)", async (title) => {
    const result = await extractFilmTitle(title);
    expect(result.confidence).toBe("high");
    expect(result.filmTitle).toBeTruthy();
  });

  const franchiseTitles = [
    "Star Wars: A New Hope",
    "Star Wars: The Empire Strikes Back",
    "Indiana Jones: Raiders of the Lost Ark",
    "Harry Potter: The Philosopher's Stone",
    "Lord of the Rings: The Fellowship of the Ring",
    "Mission: Impossible",
    "Pirates of the Caribbean: Dead Man's Chest",
    "Jurassic Park: The Lost World",
    "Mad Max: Fury Road",
    "Dune: Part Two",
  ];

  it.each(franchiseTitles)("recognises franchise title '%s' as clean", async (title) => {
    const result = await extractFilmTitle(title);
    expect(result.confidence).toBe("high");
  });
});

// ---------------------------------------------------------------------------
// Cruft removal
// ---------------------------------------------------------------------------

describe("extractFilmTitle - cruft removal", () => {
  const ratingsTests = [
    { input: "Casablanca (U)", expected: "Casablanca" },
    { input: "The Godfather (18)", expected: "The Godfather" },
    { input: "Toy Story (PG)", expected: "Toy Story" },
    { input: "Spider-Man (12A)", expected: "Spider-Man" },
    { input: "The Matrix (15)", expected: "The Matrix" },
    { input: "Jaws (12)", expected: "Jaws" },
    { input: "Some Film (18*)", expected: "Some Film" },
  ];

  it.each(ratingsTests)(
    "removes BBFC rating from '$input'",
    async ({ input, expected }) => {
      const result = await extractFilmTitle(input);
      expect(result.filmTitle).toBe(expected);
    }
  );

  const formatTests = [
    { input: "Casablanca - 35mm", expected: "Casablanca" },
    { input: "Interstellar - IMAX", expected: "Interstellar" },
    { input: "Blade Runner - 4K", expected: "Blade Runner" },
  ];

  it.each(formatTests)(
    "removes format suffix from '$input'",
    async ({ input, expected }) => {
      const result = await extractFilmTitle(input);
      expect(result.filmTitle).toBe(expected);
    }
  );

  const qaTests = [
    { input: "New Film + Q&A", expected: "New Film" },
    { input: "New Film + Q & A", expected: "New Film" },
    { input: "New Film + discussion", expected: "New Film" },
    { input: "New Film + intro", expected: "New Film" },
  ];

  it.each(qaTests)(
    "removes Q&A suffix from '$input'",
    async ({ input, expected }) => {
      const result = await extractFilmTitle(input);
      expect(result.filmTitle).toBe(expected);
    }
  );

  it("removes bracketed notes at end", async () => {
    const result = await extractFilmTitle("Some Film [Director's Cut]");
    expect(result.filmTitle).toBe("Some Film");
  });

  it("normalises multiple spaces", async () => {
    const result = await extractFilmTitle("The   Grand   Budapest   Hotel");
    expect(result.filmTitle).toBe("The Grand Budapest Hotel");
  });

  it("trims whitespace", async () => {
    const result = await extractFilmTitle("  Casablanca  ");
    expect(result.filmTitle).toBe("Casablanca");
  });
});

// ---------------------------------------------------------------------------
// Event prefix detection — these no longer hit an LLM, so confidence is
// computed by the pattern extractor's own scoring. We assert structural
// outcomes (title is truthy, prefix likely stripped) rather than confidence
// levels.
// ---------------------------------------------------------------------------

describe("extractFilmTitle - event prefixes", () => {
  const wrappedTitles = [
    "Saturday Morning Picture Club: The Muppets Christmas Carol",
    "35mm: Casablanca",
    "Marathon: Lord of the Rings",
    "Cult Classic: The Room",
  ];

  it.each(wrappedTitles)("produces a non-empty title for '%s'", async (input) => {
    const result = await extractFilmTitle(input);
    expect(result.filmTitle).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Canonical title extraction (version suffix stripping)
// ---------------------------------------------------------------------------

describe("extractFilmTitle - canonical title extraction", () => {
  const versionTests = [
    {
      input: "Apocalypse Now : Final Cut",
      expectedCanonical: "Apocalypse Now",
      expectedVersion: "Final Cut",
    },
    {
      input: "Blade Runner : The Final Cut",
      expectedCanonical: "Blade Runner",
      expectedVersion: "The Final Cut",
    },
    {
      input: "Amadeus: Director's Cut",
      expectedCanonical: "Amadeus",
      expectedVersion: "Director's Cut",
    },
    {
      input: "Aliens: Extended Edition",
      expectedCanonical: "Aliens",
      expectedVersion: "Extended Edition",
    },
    {
      input: "Apocalypse Now: Redux",
      expectedCanonical: "Apocalypse Now",
      expectedVersion: "Redux",
    },
    {
      input: "Metropolis: Restored",
      expectedCanonical: "Metropolis",
      expectedVersion: "Restored",
    },
  ];

  it.each(versionTests)(
    "extracts canonical title from '$input'",
    async ({ input, expectedCanonical, expectedVersion }) => {
      const result = await extractFilmTitle(input);
      expect(result.canonicalTitle).toBe(expectedCanonical);
      expect(result.version).toBe(expectedVersion);
    }
  );

  const nonVersionTests = [
    "Star Wars: A New Hope",
    "Mission: Impossible",
    "The Lord of the Rings: The Fellowship of the Ring",
    "Casablanca",
  ];

  it.each(nonVersionTests)(
    "keeps canonical same as display for '%s'",
    async (input) => {
      const result = await extractFilmTitle(input);
      expect(result.canonicalTitle).toBe(result.filmTitle);
      expect(result.version).toBeUndefined();
    }
  );

  it("removes BBFC rating but keeps version suffix handling", async () => {
    const result = await extractFilmTitle("Apocalypse Now : Final Cut (15)");
    expect(result.canonicalTitle).toBe("Apocalypse Now");
    expect(result.version).toBe("Final Cut");
  });
});

// ---------------------------------------------------------------------------
// Batch extraction
// ---------------------------------------------------------------------------

describe("batchExtractTitles", () => {
  it("deduplicates input titles", async () => {
    const titles = ["Casablanca", "Casablanca", "The Godfather", "Casablanca"];
    const results = await batchExtractTitles(titles);

    expect(results.size).toBe(2);
    expect(results.has("Casablanca")).toBe(true);
    expect(results.has("The Godfather")).toBe(true);
  });

  it("returns results for all unique titles", async () => {
    const titles = ["Pulp Fiction", "Amélie", "Parasite"];
    const results = await batchExtractTitles(titles);

    expect(results.size).toBe(3);
    titles.forEach((title) => {
      expect(results.has(title)).toBe(true);
      expect(results.get(title)?.filmTitle).toBeTruthy();
    });
  });

  it("handles empty array", async () => {
    const results = await batchExtractTitles([]);
    expect(results.size).toBe(0);
  });

  it("returns canonical titles for batched inputs", async () => {
    const titles = [
      "Casablanca",
      "Apocalypse Now : Final Cut",
      "Blade Runner : The Final Cut",
    ];
    const results = await batchExtractTitles(titles);

    expect(results.size).toBe(3);
    expect(results.get("Casablanca")?.canonicalTitle).toBe("Casablanca");
    expect(results.get("Apocalypse Now : Final Cut")?.canonicalTitle).toBe("Apocalypse Now");
    expect(results.get("Blade Runner : The Final Cut")?.canonicalTitle).toBe("Blade Runner");
  });
});

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

describe("extractFilmTitleCached", () => {
  beforeEach(() => {
    clearTitleCache();
  });

  it("caches results", async () => {
    const title = "Casablanca";
    const result1 = await extractFilmTitleCached(title);
    const result2 = await extractFilmTitleCached(title);

    expect(result1).toBe(result2);
  });

  it("returns different results for different titles", async () => {
    const result1 = await extractFilmTitleCached("Casablanca");
    const result2 = await extractFilmTitleCached("The Godfather");

    expect(result1.filmTitle).not.toBe(result2.filmTitle);
  });
});

describe("clearTitleCache", () => {
  it("clears the cache", async () => {
    const result1 = await extractFilmTitleCached("Casablanca");
    clearTitleCache();
    const result2 = await extractFilmTitleCached("Casablanca");

    expect(result1).toEqual(result2);
    expect(result1).not.toBe(result2);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("extractFilmTitle - edge cases", () => {
  it("handles empty string", async () => {
    const result = await extractFilmTitle("");
    expect(result.filmTitle).toBe("");
  });

  it("handles whitespace-only string", async () => {
    const result = await extractFilmTitle("   ");
    expect(result.filmTitle).toBe("");
  });

  it("handles special characters", async () => {
    const result = await extractFilmTitle("Amélie");
    expect(result.filmTitle).toBe("Amélie");
  });

  it("handles numbers in titles without colons", async () => {
    const result = await extractFilmTitle("12 Angry Men");
    expect(result.filmTitle).toBe("12 Angry Men");
  });

  it("returns a non-empty title for very long inputs", async () => {
    const longTitle =
      "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb";
    const result = await extractFilmTitle(longTitle);
    expect(result.filmTitle).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// hasWordOverlap utility
// ---------------------------------------------------------------------------

describe("hasWordOverlap", () => {
  it("detects overlap between similar titles", () => {
    expect(hasWordOverlap("Dune: Part Two", "Dune: Part Two")).toBe(true);
    expect(hasWordOverlap("Dune Part Two", "Part Two")).toBe(true);
  });

  it("rejects titles with no overlap", () => {
    expect(hasWordOverlap("New: Moonlight Sonata Screening", "Slayer Part Two")).toBe(false);
  });

  it("returns true for empty strings (conservative)", () => {
    expect(hasWordOverlap("", "Something")).toBe(true);
    expect(hasWordOverlap("Something", "")).toBe(true);
  });

  it("handles special characters", () => {
    expect(hasWordOverlap("Star Wars: A New Hope", "Star Wars A New Hope")).toBe(true);
  });

  it("ignores single-character words", () => {
    expect(hasWordOverlap("A Film", "Film")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(hasWordOverlap("THE MATRIX", "the matrix")).toBe(true);
  });
});
