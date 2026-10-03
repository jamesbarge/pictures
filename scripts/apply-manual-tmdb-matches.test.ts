/**
 * Tests for the pure planning helpers in apply-manual-tmdb-matches.
 * DB and TMDB writes are exercised by the script's default-dry run.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/tmdb", () => ({ getTMDBClient: vi.fn() }));
vi.mock("@/lib/tmdb/blocklist", () => ({ isBlockedTmdbId: vi.fn() }));
vi.mock("@/scripts/rematch-unmatched-films", () => ({ executeUpdate: vi.fn(), executeMerge: vi.fn() }));
vi.mock("@/scrapers/pipeline", () => ({ normalizeTitle: vi.fn() }));

import { chooseTitle, planManualMatches, type CandidateRow } from "./apply-manual-tmdb-matches";

const row = (id: string, title: string, screenings: number): CandidateRow => ({
  id,
  title,
  year: null,
  directors: [],
  screenings,
});

const lower = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

describe("chooseTitle", () => {
  it("adopts the TMDB title when it normalizes to the same key", () => {
    expect(chooseTitle("PRESSURE", "Pressure", lower)).toBe("Pressure");
  });

  it("keeps the scraped title when TMDB's would change the lookup key", () => {
    expect(chooseTitle("Le Boucher", "The Butcher", lower)).toBe("Le Boucher");
    expect(chooseTitle("Fjord FFFL", "Fjord", lower)).toBe("Fjord FFFL");
  });
});

describe("planManualMatches", () => {
  const notBlocked = () => false;

  it("updates the only unmatched row in place when no film owns the id", () => {
    const plan = planManualMatches({
      rowsByTitle: new Map([["Digger", [row("a", "Digger", 788)]]]),
      mapping: { Digger: 1248832 },
      owners: new Map(),
      isBlocked: notBlocked,
    });
    expect(plan).toEqual([{ kind: "update", row: row("a", "Digger", 788), tmdbId: 1248832 }]);
  });

  it("merges into the existing owner of the tmdb id", () => {
    const plan = planManualMatches({
      rowsByTitle: new Map([["Casino Royale", [row("a", "Casino Royale", 4)]]]),
      mapping: { "Casino Royale": 36557 },
      owners: new Map([[36557, { id: "owner", title: "Casino Royale" }]]),
      isBlocked: notBlocked,
    });
    expect(plan).toEqual([
      { kind: "merge", row: row("a", "Casino Royale", 4), tmdbId: 36557, targetFilmId: "owner", targetTitle: "Casino Royale" },
    ]);
  });

  it("collapses several titles sharing an id onto the busiest row", () => {
    const plan = planManualMatches({
      rowsByTitle: new Map([
        ["Minotaur FFFL", [row("b", "Minotaur FFFL", 10)]],
        ["Minotaur", [row("a", "Minotaur", 25)]],
      ]),
      mapping: { "Minotaur FFFL": 848700, Minotaur: 848700 },
      owners: new Map(),
      isBlocked: notBlocked,
    });
    expect(plan).toEqual([
      { kind: "update", row: row("a", "Minotaur", 25), tmdbId: 848700 },
      { kind: "merge", row: row("b", "Minotaur FFFL", 10), tmdbId: 848700, targetFilmId: "a", targetTitle: "Minotaur" },
    ]);
  });

  it("collapses duplicate unmatched rows that share one title", () => {
    const plan = planManualMatches({
      rowsByTitle: new Map([["Laura", [row("x", "Laura", 1), row("y", "Laura", 2)]]]),
      mapping: { Laura: 1939 },
      owners: new Map(),
      isBlocked: notBlocked,
    });
    expect(plan.map((p) => [p.kind, p.kind === "skip" ? null : p.row.id])).toEqual([
      ["update", "y"],
      ["merge", "x"],
    ]);
  });

  it("keeps the shorter, cleaner title when screening counts tie", () => {
    const plan = planManualMatches({
      rowsByTitle: new Map([
        ["FFFL Opening Gala - A Woman's Life", [row("gala", "FFFL Opening Gala - A Woman's Life", 1)]],
        ["A Woman's Life", [row("clean", "A Woman's Life", 1)]],
      ]),
      mapping: { "FFFL Opening Gala - A Woman's Life": 1258181, "A Woman's Life": 1258181 },
      owners: new Map(),
      isBlocked: notBlocked,
    });
    expect(plan[0]).toMatchObject({ kind: "update", row: { id: "clean" } });
    expect(plan[1]).toMatchObject({ kind: "merge", row: { id: "gala" }, targetFilmId: "clean" });
  });

  it("skips blocklisted ids and titles with no unmatched row", () => {
    const plan = planManualMatches({
      rowsByTitle: new Map([["Blocked", [row("a", "Blocked", 3)]]]),
      mapping: { Blocked: 111, Missing: 222 },
      owners: new Map(),
      isBlocked: (id) => id === 111,
    });
    expect(plan).toEqual([
      { kind: "skip", title: "Blocked", tmdbId: 111, reason: "tmdb id is on the global blocklist" },
      { kind: "skip", title: "Missing", tmdbId: 222, reason: "no unmatched row with upcoming screenings has this exact title" },
    ]);
  });
});
