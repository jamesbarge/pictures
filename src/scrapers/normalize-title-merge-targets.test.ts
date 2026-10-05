/**
 * Venue titles must share a cache key with the film they were merged into.
 *
 * The 2026-10-04 manual TMDB pass merged unmatched venue rows into the film
 * that owns the TMDB id. `initFilmCache` keys films on `normalizeTitle(title)`,
 * so a venue title whose key exists nowhere recreates an unmatched row on the
 * next scrape and pulls its screenings back. Each pair below is a venue title
 * and the title of the film row it was merged into (read from the films
 * table), and both must normalize to the same key through the real
 * production normalizer.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {},
  withDbTimeout: <T>(promise: Promise<T>) => promise,
}));

import { normalizeTitle } from "./pipeline";

const MERGE_TARGETS: Array<[venueTitle: string, filmTitle: string]> = [
  ["Minotaur FFFL", "Minotaur"],
  ["Fjord FFFL", "Fjord"],
  ["Case 137 FFF", "Case 137"],
  ["Wicker - Preview", "Wicker"],
  ["Wild Horse Nine - Preview", "Wild Horse Nine"],
  ["Her Private Hell + Recorded Intro", "Her Private Hell"],
  ["Heat (35mm)", "Heat"],
  ["Thief (35mm)", "Thief"],
  ["The Odyssey (35mm)", "The Odyssey"],
  ["The Odyssey (70mm)", "The Odyssey"],
  ["ERASERHEAD (16mm)", "Eraserhead"],
  ["Wake in Fright - 4K Restoration", "Wake in Fright"],
  ["Nadja • 4K Restoration • London Premiere", "Nadja"],
  ["Cactus Pears + ScreenTalk", "Cactus Pears"],
  ["Naza + Q+A", "NAZA"],
  ["LPFF 2026: Concrete Land", "Concrete Land"],
  ["Coward - FFFL", "Coward"],
  ["Iron Boy - FFFL", "Iron Boy"],
  ["Donnie Darko 25th Anniversary", "Donnie Darko"],
  ["Terminator 2: Judgment Day 35th Anniversary", "Terminator 2: Judgment Day"],
  ["Avengers: Endgame (Re-release)", "Avengers: Endgame"],
  ["ParaNorman (Remastered)", "ParaNorman"],
  ["Screening - Dune: Part Three", "Dune: Part Three"],
  ["Babykino: The Shoshani Riddle", "The Shoshani Riddle"],
  ["Crafty Movie Night - Corpse Bride", "Corpse Bride"],
  ["The Invite (BIA)", "The Invite"],
  ["Extra Geography + extended intro with director Molly Manners", "Extra Geography"],
  ["Wolfwalkers I Trans Awareness programme 2026", "Wolfwalkers"],
  ["Sinners - Black History Month 2026", "Sinners"],
  ["Black History Month 2026: Sinners", "Sinners"],
  ["The Watermelon Woman - Black History Month 2026", "The Watermelon Woman"],
  ["Black History Month 2026: The Watermelon Woman", "The Watermelon Woman"],
  // The merge target kept the venue's own title, so the decorated and the
  // bare forms must meet there too.
  ["A Woman's Life FFFL", "A Woman's Life FFFL"],
  ["A Woman's Life", "A Woman's Life FFFL"],
  ["Special Preview of Fatherland with Katja Hoyer", "Fatherland"],
  ["Girl, So Cinema Club: Sense and Sensibility", "Sense and Sensibility"],
  ["Ken Russell's The Devils: The Director's Cut", "The Devils"],
  ["Liberté (Pt2)", "Liberté"],
  ["Résistance (Pt1)", "Résistance"],
];

describe("normalizeTitle: venue titles meet their merge target's key", () => {
  for (const [venueTitle, filmTitle] of MERGE_TARGETS) {
    it(`"${venueTitle}" → key of "${filmTitle}"`, () => {
      expect(normalizeTitle(venueTitle)).toBe(normalizeTitle(filmTitle));
    });
  }
});

describe("normalizeTitle: part numbers that carry identity stay distinct", () => {
  const distinct: Array<[string, string]> = [
    ["Mockingjay - Part 2", "Mockingjay - Part 1"],
    ["Che - Part 2", "Che"],
    ["Dune: Part Two", "Dune"],
    ["Kill Bill: Vol. 2", "Kill Bill: Vol. 1"],
    ["Liberté (Pt2)", "Résistance (Pt1)"],
  ];

  for (const [a, b] of distinct) {
    it(`"${a}" ≠ "${b}"`, () => {
      expect(normalizeTitle(a)).not.toBe(normalizeTitle(b));
    });
  }
});
