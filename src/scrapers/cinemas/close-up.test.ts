import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloseUpCinemaScraper } from "./close-up";
import { FestivalDetector } from "../festivals/festival-detector";
import type { RawScreening } from "../types";

/**
 * Close-Up day-sweep planning (2026-10-04 horizon audit).
 *
 * The fixtures mirror the live markup captured that day: the homepage embeds
 * `var shows ='[...]';` (served on EVERY page) plus an h2 "what's on" list;
 * /film_programmes/ headings end with each programme's final date; a search
 * page carries one day under an h2 date heading.
 */

const BASE = "https://www.closeupfilmcentre.com";

interface ShowFixture {
  id: string;
  show_time: string;
  title: string | null;
}

function showsScript(shows: ShowFixture[]): string {
  const json = JSON.stringify(
    shows.map((s) => ({
      ...s,
      fp_id: "1",
      blink: `https://www.ticketsource.co.uk/booking/${s.id}`,
      status: "1",
      booking_availability: "1",
      film_url: "/film_programmes/2026/x/",
    })),
  );
  return `<script>var shows ='${json}';</script>`;
}

function homepage(shows: ShowFixture[], listings: string[]): string {
  const h2s = listings.map((t) => `<h2><a href="/film_programmes/2026/x/">${t}</a></h2>`).join("\n");
  return `<html><head>${showsScript(shows)}</head><body><div class="inner_block_3">${h2s}</div></body></html>`;
}

function programmeIndex(headings: string[]): string {
  const blocks = headings
    .map(
      (h) =>
        `<div class="inner_block_3 float_l border_b_1"><div class="inner_block_3_r">` +
        `<h2><a href="/film_programmes/2026/x/">${h}</a></h2></div></div>`,
    )
    .join("\n");
  return `<html><body>${blocks}</body></html>`;
}

function searchPage(shows: ShowFixture[], heading: string, listings: string[]): string {
  const rows = listings
    .map((l) => `<a href="${BASE}/film_programmes/2026/x"><span>${l}</span></a><br/>`)
    .join("\n");
  return (
    `<html><head>${showsScript(shows)}</head><body>` +
    `<div class="inner_block_3 float_l  full_block"><h2>${heading}</h2>${rows}</div></body></html>`
  );
}

const HOMEPAGE_SHOWS: ShowFixture[] = [
  { id: "101", show_time: "2026-10-05 18:15:00", title: "The Terence Davies Trilogy" },
  // The booking system emits a null title for some shows. The homepage h2 list
  // only runs ~8 days ahead, so nothing on the homepage can name this one.
  { id: "102", show_time: "2026-10-22 20:15:00", title: null },
  { id: "103", show_time: "2026-10-26 20:15:00", title: "The Festival of (In)appropriation #14" },
  { id: "104", show_time: "2026-10-31 19:00:00", title: "Winter Sleep" },
];

const HOMEPAGE = homepage(HOMEPAGE_SHOWS, ["Mon 5 October, 6.15pm: The Terence Davies Trilogy"]);

const PROGRAMME_HEADINGS = [
  "26 September 2026: Against all Odds: Albuquerque", // finished, adds nothing
  "26 October 2026: The Festival of (In)appropriation #14", // JSON names it
  "22 October 2026: Vicky Smith – Animated Matter followed by Q&A", // JSON cannot name it
  "5 - 28 October 2026: The Terence Davies Trilogy",
  "3 - 31 October 2026: Winter Sleep",
  "17 November 2026: Jenny Baines – Action Films followed by Q&A", // past the JSON
];

const SEARCH_PAGES: Record<string, string> = {
  "22-10-2026": searchPage(HOMEPAGE_SHOWS, "Thursday 22 October 2026", [
    "08:15 pm                                : Vicky Smith – Animated Matter",
  ]),
  "31-10-2026": searchPage(HOMEPAGE_SHOWS, "Saturday 31 October 2026", [
    "07:00 pm                                : Winter Sleep",
  ]),
  "17-11-2026": searchPage(HOMEPAGE_SHOWS, "Tuesday 17 November 2026", [
    "08:15 pm                                : Jenny Baines – Action Films",
  ]),
};

type Responder = (url: string) => string;

interface Internals {
  fetchUrl: (url: string) => Promise<string>;
  delay: (ms: number) => Promise<void>;
  fetchPages: () => Promise<string[]>;
  parsePages: (pages: string[]) => Promise<RawScreening[]>;
}

/** A scraper whose network is `respond`, recording every URL requested. */
function scraperWith(respond: Responder) {
  const scraper = new CloseUpCinemaScraper();
  const internals = scraper as unknown as Internals;
  const requested: string[] = [];
  vi.spyOn(internals, "fetchUrl").mockImplementation(async (url: string) => {
    requested.push(url);
    return respond(url);
  });
  vi.spyOn(internals, "delay").mockResolvedValue(undefined);
  return { internals, requested };
}

const searchDate = (url: string) => url.match(/\?date=(\d{2}-\d{2}-\d{4})$/)?.[1] ?? null;
const searchDates = (requested: string[]) =>
  requested.map(searchDate).filter((d): d is string => d !== null);

function liveSite(programme = programmeIndex(PROGRAMME_HEADINGS)): Responder {
  return (url) => {
    if (url === BASE) return HOMEPAGE;
    if (url === `${BASE}/film_programmes/`) return programme;
    const date = searchDate(url);
    if (date) return SEARCH_PAGES[date] ?? searchPage(HOMEPAGE_SHOWS, "Empty day", []);
    throw new Error(`unexpected URL ${url}`);
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-04T08:00:00Z"));
  vi.spyOn(FestivalDetector, "preload").mockResolvedValue();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Close-Up day sweep derived from /film_programmes/ headings", () => {
  it("fetches only the days the JSON cannot account for", async () => {
    const { internals, requested } = scraperWith(liveSite());

    await internals.fetchPages();

    // 22 Oct: the JSON lists a show there but cannot name it.
    // 31 Oct: the JSON's last day, reached by two range programmes.
    // 17 Nov: a one-off event past the JSON, with 16 dark days before it.
    expect(searchDates(requested)).toEqual(["22-10-2026", "31-10-2026", "17-11-2026"]);
    expect(requested.slice(0, 2)).toEqual([BASE, `${BASE}/film_programmes/`]);
  });

  it("recovers the unnamed JSON show and the one-off event past the JSON", async () => {
    const { internals } = scraperWith(liveSite());

    const screenings = await internals.parsePages(await internals.fetchPages());
    const byInstant = new Map(screenings.map((s) => [s.datetime.toISOString(), s.filmTitle]));

    // 20:15 BST on 22 Oct, 20:15 GMT on 17 Nov (clocks change on 25 Oct).
    expect(byInstant.get("2026-10-22T19:15:00.000Z")).toBe("Vicky Smith – Animated Matter");
    expect(byInstant.get("2026-11-17T20:15:00.000Z")).toBe("Jenny Baines – Action Films");
    // The JSON is served on every page; each instant still appears once.
    expect(screenings).toHaveLength(5);
    expect(new Set(screenings.map((s) => s.datetime.toISOString())).size).toBe(5);
  });

  it("sweeps a range programme's whole tail past the JSON without stopping on dark days", async () => {
    const programme = programmeIndex(["3 October - 9 November 2026: Long Season"]);
    const { internals, requested } = scraperWith(liveSite(programme));

    await internals.fetchPages();

    // 22 Oct (unnamed show) plus every day 31 Oct - 9 Nov, although 1-9 Nov
    // are all listing-free: with the published horizon known, a dark run is
    // a gap in the programme and must not end the sweep.
    expect(searchDates(requested)).toEqual([
      "22-10-2026",
      "31-10-2026",
      "01-11-2026",
      "02-11-2026",
      "03-11-2026",
      "04-11-2026",
      "05-11-2026",
      "06-11-2026",
      "07-11-2026",
      "08-11-2026",
      "09-11-2026",
    ]);
  });

  it("starts a range that opens after the JSON on its own first day", async () => {
    const programme = programmeIndex(["20 - 22 November 2026: Weekend Festival"]);
    const { internals, requested } = scraperWith(liveSite(programme));

    await internals.fetchPages();

    expect(searchDates(requested)).toEqual(["22-10-2026", "20-11-2026", "21-11-2026", "22-11-2026"]);
  });

  it("reads a December-to-January range back into the previous year", async () => {
    const programme = programmeIndex(["30 December - 2 January 2027: New Year Season"]);
    const { internals, requested } = scraperWith(liveSite(programme));

    await internals.fetchPages();

    expect(searchDates(requested)).toEqual([
      "22-10-2026",
      "30-12-2026",
      "31-12-2026",
      "01-01-2027",
      "02-01-2027",
    ]);
  });

  it("always sweeps the JSON's last day, even for a one-day programme the JSON names", async () => {
    // The array could be truncated part-way through its final day.
    const programme = programmeIndex(["31 October 2026: Halloween One-Off"]);
    const { internals, requested } = scraperWith(liveSite(programme));

    await internals.fetchPages();

    expect(searchDates(requested)).toEqual(["22-10-2026", "31-10-2026"]);
  });

  it("reads a range whose start falls after its end as already running", async () => {
    const programme = programmeIndex(["28 - 5 November 2026: Garbled Range"]);
    const { internals, requested } = scraperWith(liveSite(programme));

    await internals.fetchPages();

    expect(searchDates(requested)).toEqual([
      "22-10-2026",
      "31-10-2026",
      "01-11-2026",
      "02-11-2026",
      "03-11-2026",
      "04-11-2026",
      "05-11-2026",
    ]);
  });

  it("fails the run when a day just past the JSON cannot be fetched", async () => {
    const site = liveSite();
    const { internals } = scraperWith((url) => {
      if (searchDate(url) === "31-10-2026") throw new Error("HTTP 500: Internal Server Error");
      return site(url);
    });

    // 31 Oct is the JSON's last day: search-only coverage starts there.
    await expect(internals.fetchPages()).rejects.toThrow(/near-term Close-Up search pages/);
  });

  it("keeps the run when an unnamed-show day inside the JSON window cannot be fetched", async () => {
    const site = liveSite();
    const { internals, requested } = scraperWith((url) => {
      if (searchDate(url) === "22-10-2026") throw new Error("HTTP 500: Internal Server Error");
      return site(url);
    });

    const pages = await internals.fetchPages();

    // One unnamed show must not discard the homepage JSON and every other page.
    expect(searchDates(requested)).toEqual(["22-10-2026", "22-10-2026", "22-10-2026", "31-10-2026", "17-11-2026"]);
    expect(pages).toEqual([HOMEPAGE, SEARCH_PAGES["31-10-2026"], SEARCH_PAGES["17-11-2026"]]);
  });

  it("falls back to a contiguous sweep with the empty-day stop when the index is unreadable", async () => {
    const site = liveSite();
    const { internals, requested } = scraperWith((url) => {
      if (url === `${BASE}/film_programmes/`) throw new Error("HTTP 500: Internal Server Error");
      return site(url);
    });

    await internals.fetchPages();

    // No headings, so no idea where the programme ends: walk from the JSON's
    // last day and let five dark days in a row end it.
    expect(searchDates(requested)).toEqual([
      "22-10-2026",
      "31-10-2026",
      "01-11-2026",
      "02-11-2026",
      "03-11-2026",
      "04-11-2026",
      "05-11-2026",
    ]);
  });
});

describe("Close-Up challenge fast-fail is unchanged by sweep planning", () => {
  it("keeps the homepage and skips the sweep when the programme index is challenged", async () => {
    const site = liveSite();
    const { internals, requested } = scraperWith((url) => {
      if (url === `${BASE}/film_programmes/`) throw new Error("HTTP 403: ");
      return site(url);
    });

    const pages = await internals.fetchPages();

    expect(pages).toEqual([HOMEPAGE]);
    expect(requested).toEqual([BASE, `${BASE}/film_programmes/`]);
  });

  it("stops the sweep at the first challenged day and keeps what it has", async () => {
    const site = liveSite();
    const { internals, requested } = scraperWith((url) => {
      if (searchDate(url) === "31-10-2026") throw new Error("HTTP 403: ");
      return site(url);
    });

    const pages = await internals.fetchPages();

    expect(searchDates(requested)).toEqual(["22-10-2026", "31-10-2026"]);
    expect(pages).toHaveLength(2); // homepage + 22 Oct
  });

  it("spends no request on a later attempt once a challenge has been seen", async () => {
    const { internals, requested } = scraperWith(() => {
      throw new Error("HTTP 403: ");
    });

    await expect(internals.fetchPages()).rejects.toThrow(/Cloudflare's challenge \(homepage\)/);
    await expect(internals.fetchPages()).rejects.toThrow(/already seen earlier in this run/);
    expect(requested).toEqual([BASE]);
  });
});
