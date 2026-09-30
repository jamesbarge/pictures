/**
 * Barbican day-walk regression tests.
 *
 * Covers the two things that decide whether the venue has coverage at all:
 *   1. fetchPages() walks 70 consecutive *London* calendar days from the London
 *      "today" — not the UTC date, and without skipping or repeating a day over
 *      the BST↔GMT transition.
 *   2. parseDayPage() reads the time from the booking link's full text so am/pm
 *      survives (the time sits in a nested <span> next to an inline <svg>), and
 *      converts UK clock-face time to UTC.
 *
 * Methods under test are private; we reach in via `as unknown as { ... }` rather
 * than widening visibility for tests (same convention as bst-regression.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as cheerio from "cheerio";

vi.mock("../festivals/festival-detector", () => ({
  FestivalDetector: {
    preload: vi.fn().mockResolvedValue(undefined),
    detect: vi.fn().mockReturnValue({}),
  },
}));

import { BarbicanScraper } from "./barbican";
import type { RawScreening } from "../types";
import type { CheerioAPI } from "../utils/cheerio-types";

type PrivBarbican = {
  fetchPages: () => Promise<string[]>;
  fetchUrl: (url: string) => Promise<string>;
  delay: (ms: number) => Promise<void>;
  parseDayPage: ($: CheerioAPI, dateStr: string) => RawScreening[];
};

/** Collects the ?day= values fetchPages() requests, in order. */
async function walkedDays(now: string): Promise<string[]> {
  vi.setSystemTime(new Date(now));
  const internals = new BarbicanScraper() as unknown as PrivBarbican;
  const days: string[] = [];
  vi.spyOn(internals, "delay").mockResolvedValue(undefined);
  vi.spyOn(internals, "fetchUrl").mockImplementation(async (url: string) => {
    days.push(new URL(url).searchParams.get("day")!);
    return "<html></html>";
  });
  await internals.fetchPages();
  return days;
}

describe("Barbican day walk", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("covers 70 consecutive days", async () => {
    const days = await walkedDays("2026-08-09T09:00:00Z");
    expect(days).toHaveLength(70);
    expect(days[0]).toBe("2026-08-09");
    expect(days[69]).toBe("2026-10-17");
    expect(new Set(days).size).toBe(70);
  });

  it("starts on the London date, not the UTC date, late on a BST evening", async () => {
    // 23:30 UTC on 9 Aug is 00:30 on 10 Aug in London. The old
    // `toISOString().split("T")[0]` started the walk on 9 Aug — a day already
    // over in London, whose screenings validate() then discards as past.
    const days = await walkedDays("2026-08-09T23:30:00Z");
    expect(days[0]).toBe("2026-08-10");
    expect(days[69]).toBe("2026-10-18");
  });

  it("neither skips nor repeats a day across the BST→GMT change", async () => {
    // Clocks go back on Sunday 25 October 2026.
    const days = await walkedDays("2026-10-20T09:00:00Z");
    expect(days.slice(4, 9)).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
    ]);
    expect(new Set(days).size).toBe(70);
  });
});

/** Mirrors the real markup captured from a ?day= page on 2026-08-09. */
const DAY_PAGE_HTML = `
<div class="cinema-listing-card">
  <div class="cinema-listing-card__title"><a href="/whats-on/2026/event/the-odyssey">The Odyssey (12A)</a></div>
  <div class="cinema-listing-card__instances">
    <div class="cinema-instance-list"><div class="cinema-instance-list__list">
      <div class="cinema-instance-list__instance">
        <span class="button-styled-link"><a href="https://tickets.barbican.org.uk/choose-seats/3665201">
          <span><svg width="12" height="12"><path d="M0 0"></path></svg></span><span>11.00am</span>
        </a></span>
      </div>
      <div class="cinema-instance-list__instance">
        <span class="button-styled-link"><a href="https://tickets.barbican.org.uk/choose-seats/3665202">
          <span><svg width="12" height="12"><path d="M0 0"></path></svg></span><span>2.15pm</span>
        </a></span>
        <div class="cinema-instance-list__meta">CAP Captioning assists D/deaf and hard of hearing customers.</div>
      </div>
    </div></div>
  </div>
</div>
<div class="cinema-listing-card">
  <div class="cinema-listing-card__title"><a href="/whats-on/2026/event/outdoor-arrival">Outdoor Cinema: Arrival</a></div>
  <div class="cinema-listing-card__instances">
    <div class="cinema-instance-list__instance"><span>8.30pm (Sold out)</span></div>
  </div>
</div>
`;

describe("Barbican parseDayPage", () => {
  const parse = (dateStr: string) => {
    const internals = new BarbicanScraper() as unknown as PrivBarbican;
    return internals.parseDayPage(cheerio.load(DAY_PAGE_HTML) as CheerioAPI, dateStr);
  };

  it("keeps am/pm from the booking link's full text and converts BST to UTC", () => {
    const screenings = parse("2026-08-19");
    expect(screenings).toHaveLength(3);

    // 11.00am must stay morning (a dropped meridiem would read as 23:00),
    // 2.15pm must become 14:15 — both minus 1h for BST.
    expect(screenings[0].filmTitle).toBe("The Odyssey");
    expect(screenings[0].datetime.toISOString()).toBe("2026-08-19T10:00:00.000Z");
    expect(screenings[1].datetime.toISOString()).toBe("2026-08-19T13:15:00.000Z");
    expect(screenings[1].bookingUrl).toBe(
      "https://tickets.barbican.org.uk/choose-seats/3665202"
    );
    expect(screenings.every((s) => s.datetime.getUTCHours() >= 9)).toBe(true);
  });

  it("uses clock-face time unchanged in GMT", () => {
    const screenings = parse("2026-11-20");
    expect(screenings[0].datetime.toISOString()).toBe("2026-11-20T11:00:00.000Z");
    expect(screenings[1].datetime.toISOString()).toBe("2026-11-20T14:15:00.000Z");
  });

  it("keeps sold-out screenings, falling back to the event page URL", () => {
    const soldOut = parse("2026-08-19")[2];
    expect(soldOut.filmTitle).toBe("Outdoor Cinema: Arrival");
    expect(soldOut.datetime.toISOString()).toBe("2026-08-19T19:30:00.000Z");
    expect(soldOut.availabilityStatus).toBe("sold_out");
    expect(soldOut.bookingUrl).toBe(
      "https://www.barbican.org.uk/whats-on/2026/event/outdoor-arrival"
    );
  });

  it("gives every screening on a day a distinct sourceId", () => {
    const screenings = parse("2026-08-19");
    expect(new Set(screenings.map((s) => s.sourceId)).size).toBe(screenings.length);
    expect(screenings[0].sourceId).toBe("barbican-2026-08-19-1100-the-odyssey");
  });
});
