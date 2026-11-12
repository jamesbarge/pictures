import { describe, expect, it } from "vitest";

import { cleanFilmTitle } from "./film-title-cleaner";
import {
  LISTING_QA_2026_10_31_TITLES,
  chooseTicketSurvivor,
  destinationTitle,
  pickCanonicalFilm,
  repairedEventDescription,
  repairedSeason,
} from "./listings-qa-2026-10-31";

describe("31 Oct 2026 listing repairs", () => {
  it("sends every stored title to one film name", () => {
    expect(LISTING_QA_2026_10_31_TITLES.map((title) => [title, destinationTitle(title)])).toEqual([
      ["Festive Fun with Peppa Cinema Experience", "Festive Fun with Peppa"],
      ["SLA 2026: A Silent Voice", "A Silent Voice"],
      ["SLA 2026: A New Dawn", "A New Dawn"],
      ["SLA 2026: Ghost", "Ghost"],
      ["SLA 2026: Ninja Scroll", "Ninja Scroll"],
      ["SLA 2026: The Keeper of the Camphor Tree", "The Keeper of the Camphor Tree"],
      ["SLA 2026: We Are Aliens", "We Are Aliens"],
      ["Italian cocktails, Morricone musical intro + Ennio", "Ennio"],
      ["'Wicker Sour' cocktails, straw man making + Wicker", "Wicker"],
      ["All Out Of Bubblegum Film Club: THE SHINING", "The Shining"],
    ]);
    expect(cleanFilmTitle("All Out Of Bubblegum Film Club: THE SHINING")).toBe("THE SHINING");
  });

  it("prefers Peppa's TMDB row and The Shining's 1980 row", () => {
    const marketing = { id: "marketing", year: null, tmdbId: null };
    const peppa = { id: "peppa", year: 2026, tmdbId: 1 };
    const bare = { id: "bare", year: null, tmdbId: null };
    expect(pickCanonicalFilm(marketing, [marketing, bare, peppa])?.id).toBe("peppa");

    const club = { id: "club", year: 1980, tmdbId: null };
    const shining1980 = { id: "shining", year: 1980, tmdbId: 99 };
    const shiningOther = { id: "other", year: 1997, tmdbId: 50 };
    expect(pickCanonicalFilm(club, [club, shiningOther, shining1980])?.id).toBe("shining");

    const ennioJunk = { id: "junk", year: 2021, tmdbId: null };
    const ennio = { id: "ennio", year: 2021, tmdbId: null };
    const ennioOther = { id: "other-ennio", year: 2017, tmdbId: 7 };
    expect(pickCanonicalFilm(ennioJunk, [ennioJunk, ennioOther, ennio])?.id).toBe("ennio");
  });

  it("replaces a note that is just the film title and keeps a 4K note", () => {
    expect(
      repairedEventDescription(null, "Ennio", "Italian cocktails, Morricone musical intro"),
    ).toBe("Italian cocktails, Morricone musical intro");
    expect(
      repairedEventDescription("Ennio", "Ennio", "Italian cocktails, Morricone musical intro"),
    ).toBe("Italian cocktails, Morricone musical intro");
    expect(repairedEventDescription("(4K restoration)", "Ninja Scroll", "SLA 2026")).toBeUndefined();
    expect(repairedEventDescription(null, "Festive Fun with Peppa", null)).toBeUndefined();
    expect(repairedSeason(null, "SLA 2026")).toBe("SLA 2026");
    expect(repairedSeason("already", "SLA 2026")).toBeUndefined();
    expect(repairedSeason(null, null)).toBeUndefined();
  });

  it("drops the Peppa marketing copy and leaves a bilingual pair alone", () => {
    const plan = chooseTicketSurvivor([
      { id: "b", filmTitle: "Festive Fun with Peppa Cinema Experience", tmdbId: null },
      { id: "a", filmTitle: "Festive Fun with Peppa", tmdbId: 1 },
    ]);
    expect(plan?.keep.id).toBe("a");
    expect(plan?.drop.map((row) => row.id)).toEqual(["b"]);

    expect(
      chooseTicketSurvivor([
        { id: "es", filmTitle: "La guitarra flamenca de Yerai Cortés", tmdbId: null },
        { id: "en", filmTitle: "The Flamenco Guitar of Yerai Cortés", tmdbId: 2 },
      ]),
    ).toBeNull();
  });
});
