import { describe, expect, it } from "vitest";
import { isTitleLeakDirector } from "../utils/film-write-guards";
import { pccListingCredits } from "./prince-charles";

/**
 * 5 Nov 2026. PCC's what's-on page puts the year in `.running-time` and the
 * credit in `.film-info`. The Room is Tommy Wiseau, 2003. Monkey Tennis is
 * the podcast's name, printed as "Directed by Monkey Tennis".
 */
describe("pccListingCredits", () => {
  it("reads Tommy Wiseau and 2003 for The Room", () => {
    expect(
      pccListingCredits(
        "2003 99mins USA (18) Romance/Drama",
        "Directed by Tommy Wiseau Starring Juliette Danielle, Tommy Wiseau, Greg Sestero",
      ),
    ).toEqual({ year: 2003, director: "Tommy Wiseau" });
  });

  it("reads the Monkey Tennis credit the page prints, which the write guard rejects", () => {
    const title = "Ten Years of Monkey Tennis (with Peter Serafinowicz)";
    expect(
      pccListingCredits(
        "2026 90mins UK (15) Live Podcast",
        "Directed by Monkey Tennis Starring Adam Brooks, Nick Alder",
      ),
    ).toEqual({ year: 2026, director: "Monkey Tennis" });
    expect(isTitleLeakDirector("Monkey Tennis", title)).toBe(true);
  });

  it("still reads Angel's Egg from the same two blocks", () => {
    expect(
      pccListingCredits(
        "1985 71mins Japan (12A) Anime",
        "Directed by Mamoru Oshii Starring Keiichi Noda, Mako Hyodo, Jinpachi Nezu",
      ),
    ).toEqual({ year: 1985, director: "Mamoru Oshii" });
  });
});
