import { describe, expect, it, vi } from "vitest";

// The parser calls FestivalDetector.preload()/detect(); stub them so the test
// needs no DB (preload queries the festivals table).
vi.mock("@/scrapers/festivals/festival-detector", () => ({
  FestivalDetector: {
    preload: vi.fn(async () => {}),
    detect: () => ({}),
  },
}));

import { parseSavoyEvents, extractSavoyEventsJson, type SavoyVenue } from "./savoy";

const RIO: SavoyVenue = {
  cinemaId: "rio-dalston",
  baseUrl: "https://riocinema.org.uk",
  buildSourceId: (e, _p, dt) => `rio-dalston-${e.ID}-${dt.toISOString()}`,
  buildBookingUrl: (e, _p, base) => `${base}/Rio.dll/WhatsOn?f=${e.ID}`,
};

// 09:00Z on the fixture date → the 07:00-London performance is past, 18:00 is future.
const NOW = new Date("2026-07-18T09:00:00Z");

const londonHour = (d: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(d));

function page(eventsJson: string): string {
  return `<html><head><script>var Events = ${eventsJson};</script></head><body>x</body></html>`;
}

const RIO_EVENTS = JSON.stringify({
  Events: [
    {
      ID: 101,
      Title: "Stalker",
      Director: "Andrei Tarkovsky",
      Year: "1979",
      RunningTime: 162,
      URL: "/x",
      Performances: [
        { StartDate: "2026-07-18", StartTime: "1800", AuditoriumName: "Screen 1", URL: "/perf/1" },
        { StartDate: "2026-07-18", StartTime: "0700", AuditoriumName: "Screen 1" }, // past → dropped
      ],
    },
    {
      ID: 102,
      Title: "Solaris",
      Year: "1972",
      RunningTime: "167", // string tolerated
      Performances: [{ StartDate: "2026-07-20", StartTime: "2030", AuditoriumName: "Screen 2" }],
    },
  ],
});

describe("parseSavoyEvents (Rio config)", () => {
  it("maps future performances, drops past ones, preserves sourceId + booking URL", async () => {
    const s = await parseSavoyEvents(page(RIO_EVENTS), RIO, NOW);

    expect(s.map((x) => x.sourceId)).toEqual([
      "rio-dalston-101-2026-07-18T17:00:00.000Z", // 18:00 BST = 17:00Z
      "rio-dalston-102-2026-07-20T19:30:00.000Z", // 20:30 BST = 19:30Z
    ]);
    const stalker = s[0];
    expect(stalker.filmTitle).toBe("Stalker");
    expect(londonHour(stalker.datetime)).toBe(18);
    expect(stalker.bookingUrl).toBe("https://riocinema.org.uk/Rio.dll/WhatsOn?f=101");
    expect(stalker.screen).toBe("Screen 1");
    expect(stalker.year).toBe(1979);
    expect(stalker.runtime).toBe(162);
    expect(stalker.director).toBe("Andrei Tarkovsky");
    expect(s[1].runtime).toBe(167); // parsed from the string "167"
  });

  const FILM_ONLY: SavoyVenue = {
    cinemaId: "lexi",
    baseUrl: "https://thelexicinema.co.uk",
    filmTypeOnly: true,
    buildSourceId: (e, p) => `lexi-${e.ID}-${p.ID}`,
    buildBookingUrl: (_e, p, base) => (p.URL ? `${base}${p.URL}` : base),
  };

  it("filmTypeOnly drops non-Film performances", async () => {
    const events = JSON.stringify({
      Events: [
        {
          ID: 201,
          Title: "Mixed Programme",
          Performances: [
            { ID: 1, StartDate: "2026-07-19", StartTime: "1900", TypeDescription: "Film", URL: "/b/1" },
            { ID: 2, StartDate: "2026-07-19", StartTime: "2000", TypeDescription: "Theatre", URL: "/b/2" },
          ],
        },
      ],
    });
    const s = await parseSavoyEvents(page(events), FILM_ONLY, NOW);
    expect(s).toHaveLength(1);
    expect(s[0].sourceId).toBe("lexi-201-1");
  });

  it("filmTypeOnly KEEPS a performance with no TypeDescription (keep-on-absent)", async () => {
    const events = JSON.stringify({
      Events: [{ ID: 301, Title: "No Type", Performances: [{ ID: 5, StartDate: "2026-07-19", StartTime: "1900", URL: "/b/5" }] }],
    });
    const s = await parseSavoyEvents(page(events), FILM_ONLY, NOW);
    expect(s).toHaveLength(1); // absent discriminator → kept
  });

  it("does NOT filter by TypeDescription when filmTypeOnly is off (Rio)", async () => {
    const events = JSON.stringify({
      Events: [{ ID: 401, Title: "Theatre Night", Performances: [{ StartDate: "2026-07-19", StartTime: "1900", TypeDescription: "Theatre" }] }],
    });
    const s = await parseSavoyEvents(page(events), RIO, NOW);
    expect(s).toHaveLength(1); // Rio keeps everything (no filmTypeOnly)
  });

  it("throws when the var Events blob is missing (never empty-as-success)", async () => {
    await expect(
      parseSavoyEvents("<html><body>no data here</body></html>", RIO, NOW),
    ).rejects.toThrow(/var Events/);
  });

  it("throws on malformed (invalid) Events JSON", async () => {
    // Balanced braces but invalid JSON content → JSON.parse throws.
    await expect(
      parseSavoyEvents(page('{"Events":[{bad}]}'), RIO, NOW),
    ).rejects.toThrow();
  });

  it("throws on a truncated (unbalanced) Events blob", async () => {
    // Blob cut off mid-object (realistic partial-fetch) → unbalanced-braces throw.
    await expect(
      parseSavoyEvents(page('{"Events":[{"ID":1'), RIO, NOW),
    ).rejects.toThrow(/unbalanced/);
  });
});

describe("extractSavoyEventsJson", () => {
  it("throws on missing marker", () => {
    expect(() => extractSavoyEventsJson("<html></html>", "rio-dalston")).toThrow(/not found/);
  });

  it("extracts a nested-brace blob correctly", () => {
    const data = extractSavoyEventsJson(page('{"Events":[{"ID":1,"Title":"A {test}","Performances":[]}]}'), "rio-dalston");
    expect(data.Events).toHaveLength(1);
    expect(data.Events[0].Title).toBe("A {test}");
  });
});
