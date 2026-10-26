import { describe, expect, it } from "vitest";

import { cleanFilmTitleWithMetadata, guestAppearanceNote } from "./film-title-cleaner";
import { GUEST_TITLE_REPAIRS, pickSameYearFilm } from "./listings-qa-2026-10-26";

describe("26 Oct 2026 stored titles", () => {
  it("repairs Garden's Spider listing to the film and keeps the guest as the note", () => {
    expect(GUEST_TITLE_REPAIRS).toEqual([
      {
        from: "Spider (2002) with Peter Suschitzky",
        to: "Spider",
        year: 2002,
        note: "with Peter Suschitzky",
      },
    ]);
    for (const repair of GUEST_TITLE_REPAIRS) {
      const cleaned = cleanFilmTitleWithMetadata(repair.from);
      expect(cleaned.cleanedTitle).toBe(repair.to);
      expect(cleaned.extractedYear).toBe(repair.year);
      expect(guestAppearanceNote(repair.from)).toBe(repair.note);
    }
  });

  it("moves a screening onto the Spider row that already has year 2002", () => {
    const chosen = pickSameYearFilm(
      [
        { id: "junk", year: 2002, tmdbId: null },
        { id: "other-year", year: 2019, tmdbId: 123 },
        { id: "canonical", year: 2002, tmdbId: 424 },
        { id: "also-2002", year: 2002, tmdbId: null },
      ],
      "junk",
      2002,
    );
    expect(chosen?.id).toBe("canonical");
  });

  it("renames in place when no other Spider shares the year", () => {
    expect(
      pickSameYearFilm(
        [
          { id: "junk", year: 2002, tmdbId: null },
          { id: "namesake", year: 2007, tmdbId: 999 },
          { id: "undated", year: null, tmdbId: 1000 },
        ],
        "junk",
        2002,
      ),
    ).toBeUndefined();
  });
});
