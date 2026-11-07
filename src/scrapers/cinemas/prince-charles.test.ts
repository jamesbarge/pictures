import { describe, expect, it } from "vitest";
import { pccListingCredits } from "./prince-charles";

/**
 * 7 Nov 2026. The what's-on page puts the year and the runtime in
 * `.running-time` and the credit in `.film-info`. Reading `.film-info` alone
 * sent Tenet and Blue Velvet to TMDB with a director and no year.
 */
describe("pccListingCredits", () => {
  it("reads Tenet as Nolan, 2020, 150 minutes", () => {
    expect(
      pccListingCredits(
        "2020 150mins UK, USA (12A) Sci-Fi / Thriller",
        "Directed by Christopher Nolan Starring John David Washington, Robert Pattinson",
      ),
    ).toEqual({ year: 2020, director: "Christopher Nolan", runtime: 150 });
  });

  it("reads Blue Velvet as Lynch, 1986, 121 minutes", () => {
    expect(
      pccListingCredits(
        "1986 121mins USA (18) Neo Noir",
        "Directed by David Lynch Starring Kyle MacLachlan, Dennis Hopper, Isabella Rossellini",
      ),
    ).toEqual({ year: 1986, director: "David Lynch", runtime: 121 });
  });

  it("reads The Prestige as Nolan, 2006, 130 minutes", () => {
    expect(
      pccListingCredits(
        "2006 130mins UK, USA (12A) Psychological Thriller",
        "Directed by Christopher Nolan Starring Christian Bale, Hugh Jackman",
      ),
    ).toEqual({ year: 2006, director: "Christopher Nolan", runtime: 130 });
  });
});
