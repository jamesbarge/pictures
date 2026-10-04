import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// parseSavoyEvents preloads the festival cache (DB hit); stub it so these
// tests need no database.
vi.mock("../festivals/festival-detector", () => ({
  FestivalDetector: {
    preload: vi.fn(async () => {}),
    detect: () => ({}),
  },
}));

import { PhoenixScraper } from "./phoenix";
import type { RawScreening } from "../types";

/**
 * Phoenix reads the Savoy `var Events` blob on /PhoenixCinemaLondon.dll/Home.
 * Fixture shapes mirror the live page captured 2026-10-04 (HTML-encoded
 * titles, padded titles, relative and partner-hosted booking URLs).
 */

// 2026-10-04 12:00 BST. Clocks go back on 25 Oct, so fixtures cover both offsets.
const NOW = new Date("2026-10-04T11:00:00.000Z");

function page(events: object[]): string {
  return `<html><head><script>var Events = ${JSON.stringify({ Events: events })};</script></head><body></body></html>`;
}

function event(id: number, title: string, performances: object[], extra: Record<string, unknown> = {}) {
  return {
    ID: id,
    Title: title,
    Year: "",
    Director: "",
    RunningTime: 100,
    TypeDescription: "Film",
    URL: `https://www.phoenixcinema.co.uk/PhoenixCinemaLondon.dll/WhatsOn?f=${id}`,
    Performances: performances,
    ...extra,
  };
}

function perf(id: number, startDate: string, startTime: string, extra: Record<string, unknown> = {}) {
  return {
    ID: id,
    StartDate: startDate,
    StartTime: startTime,
    AuditoriumName: "Screen 1",
    URL: `Booking?Booking=TSelectItems.waSelectItemsPrompt.TcsWebMenuItem_0.TcsWebTab_0.TcsPerformance_${id}.TcsSection_543`,
    ...extra,
  };
}

async function parse(events: object[]): Promise<RawScreening[]> {
  const scraper = new PhoenixScraper() as unknown as {
    parsePages: (pages: string[]) => Promise<RawScreening[]>;
  };
  return scraper.parsePages([page(events)]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PhoenixScraper: full programme from the Events blob", () => {
  it("returns every event, not just the 16 the site's own grid renders", async () => {
    // The site's Populate() stops at 16 events; the old DOM scraper inherited
    // that cap. 40 events were live on 2026-10-04.
    const events = Array.from({ length: 40 }, (_, i) => {
      const day = String(5 + (i % 20)).padStart(2, "0");
      return event(1000 + i, `Event ${i}`, [perf(2000 + i, `2026-10-${day}`, "1900")]);
    });

    const screenings = await parse(events);

    expect(screenings).toHaveLength(40);
    expect(new Set(screenings.map((s) => s.filmTitle)).size).toBe(40);
  });

  it("emits far-future live events and the mixed programme", async () => {
    const screenings = await parse([
      event(549766, "Met Opera 2026-27: Parsifal", [perf(549767, "2027-06-05", "1700", { IsOpenForSale: false })], {
        TypeDescription: "Opera",
      }),
      event(592792, "GIANT - The Play", [perf(606969, "2026-11-19", "1930"), perf(606972, "2026-11-22", "1400")], {
        TypeDescription: "Theatre",
      }),
    ]);

    // The scraper emits all three; the pipeline's 90-day validator cap holds
    // Parsifal back until it is within range.
    expect(screenings.map((s) => s.datetime.toISOString())).toEqual([
      "2027-06-05T16:00:00.000Z", // 17:00 BST
      "2026-11-19T19:30:00.000Z", // 19:30 GMT
      "2026-11-22T14:00:00.000Z",
    ]);
    expect(screenings.every((s) => s.timeSource === "local-24h")).toBe(true);
  });

  it("skips performances that have already started", async () => {
    const screenings = await parse([
      event(742263, "Digger", [perf(1, "2026-10-04", "1100"), perf(2, "2026-10-04", "1645")]),
    ]);

    expect(screenings.map((s) => s.datetime.toISOString())).toEqual(["2026-10-04T15:45:00.000Z"]);
  });

  it("throws when the Events blob is missing instead of returning an empty programme", async () => {
    const scraper = new PhoenixScraper() as unknown as {
      parsePages: (pages: string[]) => Promise<RawScreening[]>;
    };
    await expect(scraper.parsePages(["<html><body>maintenance</body></html>"])).rejects.toThrow(
      /var Events/,
    );
  });
});

describe("PhoenixScraper: continuity with the old DOM scraper", () => {
  it("decodes and trims titles, keeping the legacy sourceId slug", async () => {
    const [qa, padded, spaced] = await parse([
      event(699764, "Phoenix For Nature: Derek vs Derek + director Q&amp;A", [perf(699766, "2026-10-08", "1745")]),
      event(729730, " THE FATHER (2020) + Q&amp;A (FREE)", [perf(729740, "2026-11-14", "1600")]),
      event(675928, "The  People's Emergency Briefing", [perf(675929, "2026-10-14", "1800")]),
    ]);

    expect(qa.filmTitle).toBe("Phoenix For Nature: Derek vs Derek + director Q&A");
    // Exact sourceId already stored by the old scraper for this screening.
    expect(qa.sourceId).toBe(
      "phoenix-phoenix-for-nature-derek-vs-derek-director-q-a-2026-10-08T16:45:00.000Z",
    );
    expect(padded.filmTitle).toBe("THE FATHER (2020) + Q&A (FREE)");
    expect(padded.sourceId).toBe("phoenix-the-father-2020-q-a-free--2026-11-14T16:00:00.000Z");
    expect(spaced.sourceId).toBe("phoenix-the-people-s-emergency-briefing-2026-10-14T17:00:00.000Z");
  });

  it("resolves Savoy booking links against the .dll directory, keeps partner links, falls back on bad ones", async () => {
    const [savoy, partner, missing, malformed] = await parse([
      event(742263, "Digger", [perf(747803, "2026-10-04", "1645")]),
      event(747843, "24 Hour Party People", [
        perf(747844, "2026-10-05", "2000", {
          URL: "https://escapes.cinematik.app/book/24-hour-party-people-phoenix-cinema-trust-limited-phoenix-cinema-2026-10-05",
        }),
      ]),
      event(741211, "Phoenix Classics: In Bruges", [perf(745761, "2026-10-18", "1400", { URL: "" })]),
      event(740065, "Japanese Film Club: Ringu", [
        perf(740066, "2026-10-31", "1700", { URL: "https:// japanesefilm.club/ringu/" }),
      ]),
    ]);

    expect(savoy.bookingUrl).toBe(
      "https://www.phoenixcinema.co.uk/PhoenixCinemaLondon.dll/Booking?Booking=TSelectItems.waSelectItemsPrompt.TcsWebMenuItem_0.TcsWebTab_0.TcsPerformance_747803.TcsSection_543",
    );
    expect(partner.bookingUrl).toBe(
      "https://escapes.cinematik.app/book/24-hour-party-people-phoenix-cinema-trust-limited-phoenix-cinema-2026-10-05",
    );
    expect(missing.bookingUrl).toBe("https://www.phoenixcinema.co.uk/PhoenixCinemaLondon.dll/WhatsOn?f=741211");
    // A hand-typed partner link that `new URL` rejects must not fail the venue.
    expect(malformed.bookingUrl).toBe("https://www.phoenixcinema.co.uk/PhoenixCinemaLondon.dll/WhatsOn?f=740065");
  });

  it("forwards metadata, trimming padded directors and Savoy's Oversell allocation", async () => {
    const [rocky, father] = await parse([
      event(741223, "Tribute to Tim Curry: The Rocky Horror Picture Show", [perf(741224, "2026-10-30", "2000")], {
        Year: "1975",
        Director: " Jim Sharman",
        RunningTime: 100,
      }),
      event(729730, "THE FATHER (2020) + Q&amp;A (FREE)", [
        perf(729740, "2026-11-14", "1600", { AuditoriumName: "Screen 1 Oversell" }),
      ]),
    ]);

    expect(rocky).toMatchObject({ year: 1975, director: "Jim Sharman", runtime: 100, screen: "Screen 1" });
    expect(father.director).toBeUndefined();
    expect(father.screen).toBe("Screen 1");
  });
});
