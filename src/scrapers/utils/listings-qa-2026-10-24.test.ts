import { describe, expect, it } from "vitest";

import { cleanFilmTitle, listingEventNote } from "./film-title-cleaner";
import { LISTING_TITLE_REPAIRS, directorsWithoutCopiedTitle } from "./listings-qa-2026-10-24";

describe("24 Oct 2026 stored titles", () => {
  it("repairs each live title to the film, and keeps the label as the note", () => {
    expect(LISTING_TITLE_REPAIRS.map((repair) => repair.from)).toEqual([
      "BFI IMAX exclusive preview: Godzilla Minus Zero",
      "Special preview: La Bola Negra",
      "Women and the World Festival: Traces",
    ]);
    for (const repair of LISTING_TITLE_REPAIRS) {
      expect(cleanFilmTitle(repair.from)).toBe(repair.to);
      expect(listingEventNote(repair.from)).toBe(repair.note);
    }
  });

  it("clears directors when the only credit is the raw title", () => {
    expect(
      directorsWithoutCopiedTitle(["Special preview: La Bola Negra"], "Special preview: La Bola Negra"),
    ).toEqual([]);
    expect(directorsWithoutCopiedTitle(["Takashi Yamazaki"], "BFI IMAX exclusive preview: Godzilla Minus Zero")).toEqual([
      "Takashi Yamazaki",
    ]);
  });
});
