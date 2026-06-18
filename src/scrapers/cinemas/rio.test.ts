import { beforeEach, describe, expect, it, vi } from "vitest";
import { RioScraper } from "./rio";
import { FestivalDetector } from "../festivals/festival-detector";
import type { RawScreening } from "../types";

/**
 * Rio embedded-JSON parsing tests (plan 006).
 *
 * The Rio homepage embeds `var Events = {"Events": [...]};` with per-film
 * metadata including `RunningTime` (minutes, JSON number). These tests pin
 * that the scraper forwards RunningTime onto RawScreening.runtime, guarded
 * to the 1-600 band, and tolerates string-shaped values.
 */

/** Build a fixture page from a list of Rio Event objects. */
function fixturePage(events: object[]): string {
  const json = JSON.stringify({ Events: events });
  return `<html><head><script>var Events = ${json};</script></head><body></body></html>`;
}

function fixtureEvent(overrides: Record<string, unknown> = {}) {
  return {
    ID: 12345,
    Title: "The Long Goodbye",
    Director: "Robert Altman",
    Year: "1973",
    RunningTime: 112,
    URL: "/Rio.dll/WhatsOn?f=12345",
    Performances: [
      {
        StartDate: "2030-06-20",
        StartTime: "1830",
        AuditoriumName: "Screen 1",
        URL: "/Rio.dll/Booking?x=1",
      },
    ],
    ...overrides,
  };
}

async function parse(events: object[]): Promise<RawScreening[]> {
  const scraper = new RioScraper();
  const internals = scraper as unknown as {
    parsePages: (pages: string[]) => Promise<RawScreening[]>;
  };
  return internals.parsePages([fixturePage(events)]);
}

beforeEach(() => {
  vi.spyOn(FestivalDetector, "preload").mockResolvedValue();
});

describe("RioScraper — RunningTime → RawScreening.runtime", () => {
  it("forwards a numeric RunningTime", async () => {
    const screenings = await parse([fixtureEvent({ RunningTime: 112 })]);
    expect(screenings).toHaveLength(1);
    expect(screenings[0].runtime).toBe(112);
  });

  it("coerces a string-shaped RunningTime", async () => {
    const screenings = await parse([fixtureEvent({ RunningTime: "95" })]);
    expect(screenings[0].runtime).toBe(95);
  });

  it("drops RunningTime 0 (missing-field sentinel)", async () => {
    const screenings = await parse([fixtureEvent({ RunningTime: 0 })]);
    expect(screenings[0].runtime).toBeUndefined();
  });

  it("drops RunningTime outside the 1-600 band", async () => {
    const screenings = await parse([fixtureEvent({ RunningTime: 999 })]);
    expect(screenings[0].runtime).toBeUndefined();
  });

  it("still forwards year and director alongside runtime (regression)", async () => {
    const screenings = await parse([fixtureEvent()]);
    expect(screenings[0].year).toBe(1973);
    expect(screenings[0].director).toBe("Robert Altman");
    expect(screenings[0].filmTitle).toBe("The Long Goodbye");
    expect(screenings[0].sourceId).toMatch(/^rio-dalston-12345-/);
  });

  it("skips past performances entirely", async () => {
    const screenings = await parse([
      fixtureEvent({
        Performances: [
          {
            StartDate: "2020-01-01",
            StartTime: "1830",
            AuditoriumName: "Screen 1",
            URL: "/Rio.dll/Booking?x=1",
          },
        ],
      }),
    ]);
    expect(screenings).toHaveLength(0);
  });
});
