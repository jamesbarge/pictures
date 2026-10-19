import { describe, expect, it } from "vitest";
import { ElectricScraperV2 } from "./electric-v2";
import type { RawScreening } from "../types";

/**
 * White City sold-out showings come back with `link: false` and a message.
 * The screening id is still the ticket path the bookable rows use.
 */
function apiPage(): string {
  return JSON.stringify({
    cinemas: {},
    films: {
      "1": {
        vistaId: "1",
        title: "The Social Reckoning",
        image: "",
        link: "/film/the-social-reckoning/",
        rating: "",
        short_synopsis: "",
        premiere: "2026",
        director: "Aaron Sorkin",
        screeningCinemas: [],
        screeningTypes: [],
        screenings: { byCinema: {}, byDateCinemaTime: {} },
        cinemas: {},
      },
    },
    screenings: {
      "79331": {
        id: 79331,
        film: 1,
        d: "2026-10-19",
        t: "18:30",
        cinema: 602,
        st: "",
        sn: "",
        r: "",
        bookable: false,
        link: false,
        message: "This screening is sold out.",
      },
      "79353": {
        id: 79353,
        film: 1,
        d: "2026-10-20",
        t: "20:30",
        cinema: 602,
        st: "",
        sn: "",
        r: "",
        bookable: true,
        link: "/tickets/79353",
        message: "",
      },
    },
    screeningsByDate: {},
    filmOrder: {},
    screeningTypes: {},
    isMember: false,
    attributeNotes: [],
  });
}

describe("Electric White City booking URLs", () => {
  it("uses /tickets/<id> for a sold-out showing and keeps a real ticket link", async () => {
    const scraper = new ElectricScraperV2("electric-white-city");
    const internals = scraper as unknown as {
      parsePages: (pages: string[]) => Promise<RawScreening[]>;
    };
    const screenings = await internals.parsePages([apiPage()]);
    const soldOut = screenings.find((row) => row.sourceId === "electric-79331");
    const bookable = screenings.find((row) => row.sourceId === "electric-79353");

    expect(soldOut?.bookingUrl).toBe("https://www.electriccinema.co.uk/tickets/79331");
    expect(soldOut?.availabilityStatus).toBe("sold_out");
    expect(bookable?.bookingUrl).toBe("https://www.electriccinema.co.uk/tickets/79353");
    expect(bookable?.availabilityStatus).toBeUndefined();
  });
});
