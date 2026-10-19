import { describe, expect, it } from "vitest";
import {
  eventNoteFromTitle,
  planListingsQaFilm,
  repairElectricProgrammeUrl,
} from "./listings-qa-2026-10-19";

describe("19 Oct 2026 repair plans", () => {
  it("clears runtime directors and keeps the minutes", () => {
    expect(planListingsQaFilm({
      title: "Members' Mingle",
      directors: ["180m."],
      runtime: null,
    })).toMatchObject({
      title: "Members' Mingle",
      directors: [],
      runtime: 180,
      eventNote: null,
    });
    expect(planListingsQaFilm({ title: "Site&Sound 12 - Suburbs", directors: ["90m."] })?.runtime).toBe(90);
    expect(planListingsQaFilm({ title: "The Sound of Storytelling", directors: ["120m."] })?.runtime).toBe(120);
  });

  it("title-cases Dreamland's director without touching its runtime", () => {
    expect(planListingsQaFilm({
      title: "Dreamland",
      year: 2025,
      directors: ["mohsen enayati"],
      runtime: 64,
    })).toMatchObject({
      title: "Dreamland",
      directors: ["Mohsen Enayati"],
      year: 2025,
      runtime: 64,
    });
  });

  it("plans the live titles", () => {
    expect(planListingsQaFilm({ title: "Final Shows - The Odyssey", directors: [] })).toMatchObject({
      title: "The Odyssey",
      eventNote: "Final Shows",
    });
    expect(planListingsQaFilm({
      title: "MS. 45 PLUS ✝✝✝ BASEMENT NUNSPLOITATION COSTUME PARTY ✝✝✝",
      year: 1981,
      directors: ["Abel Ferrara"],
    })).toMatchObject({
      title: "Ms. 45",
      directors: ["Abel Ferrara"],
      eventNote: "Basement nunsploitation costume party",
    });
    expect(planListingsQaFilm({
      title: "LONDON FESTIVAL OF QUEER SPANISH CULTURE: LA BOLA NEGRA",
      year: 2026,
      directors: ["Javier Calvo & Javier Ambrossi"],
    })).toMatchObject({
      title: "La Bola Negra",
      eventNote: "LONDON FESTIVAL OF QUEER SPANISH CULTURE",
    });
    expect(planListingsQaFilm({
      title: "Category H Halloween Special: BLACULA + MA",
      year: 1972,
      directors: ["William Crain / Tate Taylor"],
    })).toMatchObject({
      title: "Blacula + Ma",
      directors: ["William Crain", "Tate Taylor"],
      eventNote: "Category H Halloween Special",
    });
    expect(planListingsQaFilm({
      title: "My Brother's Wedding + Recorded Charles Burnett Introduction",
    })?.eventNote).toBe("Recorded Charles Burnett Introduction");
    expect(planListingsQaFilm({ title: "Moonlight 10th anniversary with recorded intro" })).toMatchObject({
      title: "Moonlight",
      eventNote: "10th anniversary with recorded intro",
    });
    expect(planListingsQaFilm({ title: "Avengers Endgame: Encore", directors: ["Anthony Russo", "Joe Russo"] })).toMatchObject({
      title: "Avengers Endgame",
      eventNote: "Encore",
    });
    expect(planListingsQaFilm({ title: "Nosferatu live score by Hugo Max", directors: ["F. W. Murnau"] })).toMatchObject({
      title: "Nosferatu",
      directors: ["F. W. Murnau"],
      eventNote: "live score by Hugo Max",
    });
    expect(planListingsQaFilm({
      title: "Arrows of Desire Book Launch + Friendship\u2019s Death",
      year: 1987,
      directors: ["Peter Wollen"],
    })).toMatchObject({
      title: "Friendship\u2019s Death",
      eventNote: "Arrows of Desire Book Launch",
    });
    expect(planListingsQaFilm({
      title: "Andy Warhol's Prison + Dorothy Dean Book Launch",
      year: 1965,
      directors: ["Andy Warhol"],
    })).toMatchObject({
      title: "Andy Warhol's Prison",
      eventNote: "Dorothy Dean Book Launch",
    });
    expect(planListingsQaFilm({
      title: "London Breeze Film Festival Gala Closing Film + Awards: Such a Vivid Imagination (UK)",
    })).toMatchObject({
      title: "Such a Vivid Imagination",
      eventNote: "London Breeze Film Festival Gala Closing Film + Awards",
    });
    expect(planListingsQaFilm({ title: "London Breeze: The Sound of Storytelling + Networking", directors: ["120m."] })).toMatchObject({
      title: "The Sound of Storytelling",
      directors: [],
      runtime: 120,
      eventNote: "London Breeze + Networking",
    });
    expect(planListingsQaFilm({
      title: "Little Shop of Horrors (director\u2019s Cut)",
      year: 1986,
      directors: ["Frank Oz"],
    })).toMatchObject({
      title: "Little Shop of Horrors",
      eventNote: "Director's Cut",
    });
    expect(planListingsQaFilm({ title: "Voice of a Gener...", directors: [] })).toMatchObject({
      title: "Voice of a Generation",
      eventNote: "ScreenTalk with director Denholm Hewlett and Peven Everett",
    });
  });

  it("does not retitle shouted Nickel films #830 already title-cases", () => {
    expect(planListingsQaFilm({ title: "CHAMPAGNE AND BULLETS", directors: ["John De Hart", "James Paradise"] })).toBeNull();
    expect(planListingsQaFilm({ title: "THE MAD BOMBER", directors: ["Bert I. Gordon"] })).toBeNull();
  });

  it("is idempotent once the row is repaired", () => {
    const once = planListingsQaFilm({
      title: "Category H Halloween Special: BLACULA + MA",
      directors: ["William Crain / Tate Taylor"],
      year: 1972,
    });
    expect(once).not.toBeNull();
    expect(planListingsQaFilm(once!)).toBeNull();
  });

  it("turns an Electric programme URL with an electric source id into the ticket path", () => {
    expect(repairElectricProgrammeUrl({
      bookingUrl: "https://www.electriccinema.co.uk/programme/",
      sourceId: "electric-79331",
      availabilityStatus: null,
    })).toEqual({
      bookingUrl: "https://www.electriccinema.co.uk/tickets/79331",
      availabilityStatus: "sold_out",
    });
    expect(repairElectricProgrammeUrl({
      bookingUrl: "https://www.electriccinema.co.uk/tickets/79353",
      sourceId: "electric-79353",
    })).toBeNull();
    expect(repairElectricProgrammeUrl({
      bookingUrl: "https://www.electriccinema.co.uk/programme/",
      sourceId: null,
    })).toBeNull();
  });

  it("keeps the ScreenTalk on the Barbican h1 the day card truncated", () => {
    expect(eventNoteFromTitle(
      "Peven Everett: Voice of a Generation + ScreenTalk with director Denholm Hewlett and Peven Everett (12A*)",
    )).toBe("ScreenTalk with director Denholm Hewlett and Peven Everett");
  });
});
