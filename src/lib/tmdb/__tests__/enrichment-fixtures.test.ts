/**
 * Smoke tests for the enrichment regression fixtures. These tests assert
 * the structural invariants (counts match, no duplicates, valid shape).
 *
 * The fixtures themselves are the regression target. Behavioural tests
 * that exercise the matcher against each fixture will be added when the
 * bge-m3 + Claude-judge pipeline lands (Phase 3).
 */

import { describe, expect, it } from "vitest";
import {
  CINEMA_CURATORIAL_PREFIXES,
  TITLE_SUFFIXES_TO_STRIP,
  WRONG_TMDB_REGRESSION_CASES,
  DIRECTOR_NORMALISATION_PAIRS,
  BILINGUAL_TITLE_PAIRS,
  FIXTURE_COUNTS,
} from "./enrichment-fixtures";

describe("enrichment fixtures: structural invariants", () => {
  it("totals to 136 fixtures (74+26+18+10+8)", () => {
    expect(FIXTURE_COUNTS.prefixes).toBe(74);
    expect(FIXTURE_COUNTS.suffixes).toBe(26);
    expect(FIXTURE_COUNTS.wrongTmdb).toBe(18);
    expect(FIXTURE_COUNTS.directors).toBe(10);
    expect(FIXTURE_COUNTS.bilingual).toBe(8);
    expect(FIXTURE_COUNTS.total).toBe(136);
  });

  it("has no duplicate prefixes (case-sensitive)", () => {
    const seen = new Set<string>();
    for (const p of CINEMA_CURATORIAL_PREFIXES) {
      expect(seen.has(p), `duplicate prefix: ${p}`).toBe(false);
      seen.add(p);
    }
  });

  it("has no duplicate suffixes", () => {
    const seen = new Set<string>();
    for (const s of TITLE_SUFFIXES_TO_STRIP) {
      expect(seen.has(s), `duplicate suffix: ${s}`).toBe(false);
      seen.add(s);
    }
  });

  it("wrong-tmdb cases each have a title and a note", () => {
    for (const c of WRONG_TMDB_REGRESSION_CASES) {
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.note.length).toBeGreaterThan(0);
      expect(c.badTmdbId === null || typeof c.badTmdbId === "number").toBe(true);
      expect(c.correctTmdbId === null || typeof c.correctTmdbId === "number").toBe(true);
    }
  });

  it("director pairs each have a canonical and a variant", () => {
    for (const p of DIRECTOR_NORMALISATION_PAIRS) {
      expect(p.canonical.length).toBeGreaterThan(0);
      expect(p.variant.length).toBeGreaterThan(0);
      expect(p.canonical).not.toBe(p.variant);
    }
  });

  it("bilingual pairs each have english and original forms", () => {
    for (const p of BILINGUAL_TITLE_PAIRS) {
      expect(p.english.length).toBeGreaterThan(0);
      expect(p.original.length).toBeGreaterThan(0);
      expect(p.english).not.toBe(p.original);
    }
  });
});
