/**
 * David Lean Cinema: TicketSolve XML feed (2026-10-04).
 *
 * Fixtures mirror the live https://davidleancinema.ticketsolve.com/shows.xml
 * shape: venues > venue > shows > show > events > event, names and
 * descriptions in CDATA, `date_time_iso` with TicketSolve's own UTC offset,
 * and a per-event XML feed that alone carries onsale_time/available/capacity.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DAVID_LEAN_FEED_URL, DavidLeanScraper } from "./david-lean";
import type { RawScreening } from "../types";

const ORIGIN = "https://davidleancinema.ticketsolve.com";

interface EventFixture {
  id: string;
  iso: string;
  status?: string;
}

interface ShowFixture {
  id: string;
  name: string;
  description?: string;
  events: EventFixture[];
}

const seatsUrl = (show: string, event: string) => `${ORIGIN}/shows/${show}/events/${event}/seats`;
const eventFeedUrl = (show: string, event: string) => `${ORIGIN}/shows/${show}/events/${event}.xml`;

function feedXml(shows: ShowFixture[], venueName = "David Lean Cinema"): string {
  const showXml = shows
    .map((s) => {
      const events = s.events
        .map(
          (e) => `
          <event id="${e.id}">
            <name><![CDATA[${e.iso} @ ${venueName} ${s.name}]]></name>
            <date_time_iso format="ISO 8601" zone="GMT">${e.iso}</date_time_iso>
            <url>${seatsUrl(s.id, e.id)}</url>
            <status>${e.status ?? "available"}</status>
            <feed><url>${eventFeedUrl(s.id, e.id)}</url></feed>
          </event>`,
        )
        .join("");
      return `
      <show id="${s.id}">
        <name><![CDATA[${s.name}]]></name>
        <description><![CDATA[${s.description ?? ""}]]></description>
        <url>${ORIGIN}/shows/${s.id}/events</url>
        <events>${events}</events>
      </show>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<venues><venue id="426566287"><name><![CDATA[${venueName}]]></name><shows>${showXml}</shows></venue></venues>`;
}

function eventDetailXml(o: { id: string; available: number; capacity: number; onsale?: string }): string {
  const onsale = o.onsale ? `<onsale_time format="ISO 8601" zone="IST">${o.onsale}</onsale_time>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<event id="${o.id}">
  <status>SOLD OUT</status>
  <available>${o.available}</available>
  <capacity>${o.capacity}</capacity>
  ${onsale}
</event>`;
}

interface Internals {
  fetchUrl: (url: string) => Promise<string>;
  delay: (ms: number) => Promise<void>;
  fetchPages: () => Promise<string[]>;
  parsePages: (pages: string[]) => Promise<RawScreening[]>;
}

/** Run fetchPages + parsePages against `responses`, recording every URL requested. */
async function scrapeWith(responses: Record<string, string | Error | (() => string)>) {
  const scraper = new DavidLeanScraper();
  const internals = scraper as unknown as Internals;
  const requested: string[] = [];
  vi.spyOn(internals, "fetchUrl").mockImplementation(async (url: string) => {
    requested.push(url);
    const body = responses[url];
    if (body === undefined) throw new Error(`unexpected URL ${url}`);
    if (body instanceof Error) throw body;
    return typeof body === "function" ? body() : body;
  });
  vi.spyOn(internals, "delay").mockResolvedValue(undefined);
  const screenings = await internals.parsePages(await internals.fetchPages());
  return { screenings, requested };
}

const byId = (screenings: RawScreening[], eventId: string) =>
  screenings.find((s) => s.sourceId === `david-lean-${eventId}`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-04T08:00:00Z"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("DavidLeanScraper: feed mapping", () => {
  it("maps an event to a screening with its own booking URL and a stable sourceId", async () => {
    // The homepage wrote this one as "from 10.30am" (doors); the feed has the
    // real start, 12:00 BST.
    const feed = feedXml([
      {
        id: "1173700001",
        name: "ANIMAL SHORTS PLUS WORKSHOP",
        events: [{ id: "428000001", iso: "2026-10-04T12:00:00+01:00" }],
      },
    ]);

    const { screenings } = await scrapeWith({ [DAVID_LEAN_FEED_URL]: feed });

    expect(screenings).toEqual([
      {
        filmTitle: "ANIMAL SHORTS PLUS WORKSHOP",
        datetime: new Date("2026-10-04T11:00:00.000Z"),
        bookingUrl: seatsUrl("1173700001", "428000001"),
        sourceId: "david-lean-428000001",
        timeSource: "iso",
        availabilityStatus: "available",
      },
    ]);
  });

  it("keeps UTC correct either side of the 25 October clock change", async () => {
    const feed = feedXml([
      {
        id: "1",
        name: "BAD APPLES",
        events: [
          { id: "11", iso: "2026-10-24T14:00:00+01:00" },
          { id: "12", iso: "2026-10-27T14:30:00+00:00" },
        ],
      },
    ]);

    const { screenings } = await scrapeWith({ [DAVID_LEAN_FEED_URL]: feed });

    expect(byId(screenings, "11")?.datetime.toISOString()).toBe("2026-10-24T13:00:00.000Z");
    expect(byId(screenings, "12")?.datetime.toISOString()).toBe("2026-10-27T14:30:00.000Z");
  });

  it("reads the wall clock as London time when the feed's offset disagrees with London", async () => {
    // 24 October is BST. A "+00:00" here would mean TicketSolve's venue
    // timezone is misconfigured; the venue and every listing are in London.
    const feed = feedXml([
      { id: "1", name: "BAD APPLES", events: [{ id: "11", iso: "2026-10-24T14:00:00+00:00" }] },
    ]);

    const { screenings } = await scrapeWith({ [DAVID_LEAN_FEED_URL]: feed });

    expect(byId(screenings, "11")?.datetime.toISOString()).toBe("2026-10-24T13:00:00.000Z");
    expect(byId(screenings, "11")?.timeSource).toBe("local-24h");
  });

  it("moves a trailing screening-type note out of the title", async () => {
    const feed = feedXml([
      {
        id: "1",
        name: "SCHOOL OF ROCK (Dementia-Friendly Screening)",
        events: [{ id: "11", iso: "2026-10-06T11:00:00+01:00" }],
      },
      { id: "2", name: "THE INVITE (Babes-In-Arms)", events: [{ id: "21", iso: "2026-10-09T11:00:00+01:00" }] },
      { id: "3", name: "SCHOOL OF ROCK (Relaxed Screening)", events: [{ id: "31", iso: "2026-10-24T11:00:00+01:00" }] },
      { id: "4", name: "(500) DAYS OF SUMMER", events: [{ id: "41", iso: "2026-10-25T14:00:00+00:00" }] },
    ]);

    const { screenings } = await scrapeWith({ [DAVID_LEAN_FEED_URL]: feed });

    expect(
      screenings.map((s) => [s.filmTitle, s.eventDescription, s.eventType]),
    ).toEqual([
      ["SCHOOL OF ROCK", "Dementia-Friendly Screening", undefined],
      ["THE INVITE", "Babes-In-Arms", undefined],
      // Stripping the note hides it from title classification, so the
      // scraper names the event type itself.
      ["SCHOOL OF ROCK", "Relaxed Screening", "relaxed"],
      ["(500) DAYS OF SUMMER", undefined, undefined],
    ]);
  });

  it("reads year and runtime from the description's stats line", async () => {
    const feed = feedXml([
      {
        id: "1",
        name: "DRACULA",
        description:
          '<div><b><font size="5">Dracula (Cert TBC) &amp; Short film</font></b></div>' +
          '<div><font size="3">Genre: Horror</font></div><div><font size="3">UK | 1958 | 83 mins</font></div>' +
          // Adjacent divs run together as text: "83 minsDirector: …".
          '<div><font size="3">Director: Terence Fisher</font></div>',
        events: [{ id: "11", iso: "2026-10-31T18:00:00+00:00" }],
      },
      { id: "2", name: "1 IN 2", events: [{ id: "21", iso: "2026-11-17T14:30:00+00:00" }] },
    ]);

    const { screenings } = await scrapeWith({ [DAVID_LEAN_FEED_URL]: feed });

    expect(byId(screenings, "11")).toMatchObject({ year: 1958, runtime: 83 });
    expect(byId(screenings, "21")?.year).toBeUndefined();
    expect(byId(screenings, "21")?.runtime).toBeUndefined();
  });

  it("skips a second venue on the same TicketSolve account", async () => {
    const ours = feedXml([{ id: "1", name: "BAD APPLES", events: [{ id: "11", iso: "2026-10-24T14:00:00+01:00" }] }]);
    const theirs = feedXml(
      [{ id: "2", name: "A CONCERT", events: [{ id: "21", iso: "2026-10-25T19:00:00+00:00" }] }],
      "Braithwaite Hall",
    );
    const both = ours.replace("</venues>", theirs.slice(theirs.indexOf("<venue ")));

    const { screenings } = await scrapeWith({ [DAVID_LEAN_FEED_URL]: both });

    expect(screenings.map((s) => s.sourceId)).toEqual(["david-lean-11"]);
  });

  it("fails loudly when the response has no David Lean venue", async () => {
    // A 200 that is a challenge page, a maintenance page or a renamed venue
    // must fail the venue, or the run records success with 0 screenings.
    const otherVenue = feedXml(
      [{ id: "1", name: "BAD APPLES", events: [{ id: "11", iso: "2026-10-24T14:00:00+01:00" }] }],
      "Braithwaite Hall",
    );
    await expect(scrapeWith({ [DAVID_LEAN_FEED_URL]: otherVenue })).rejects.toThrow(/no David Lean venue/);
    await expect(
      scrapeWith({ [DAVID_LEAN_FEED_URL]: "<!DOCTYPE html><html><title>Just a moment...</title></html>" }),
    ).rejects.toThrow(/no David Lean venue/);
  });

  it("fails loudly when the feed itself cannot be fetched", async () => {
    await expect(
      scrapeWith({ [DAVID_LEAN_FEED_URL]: new Error("HTTP 503: Service Unavailable") }),
    ).rejects.toThrow("HTTP 503");
  });
});

describe("DavidLeanScraper: availability", () => {
  const SHOW = "1173693770";

  function soldOutFeed(): string {
    return feedXml([
      {
        id: SHOW,
        name: "1 IN 2",
        events: [
          { id: "100", iso: "2026-11-17T14:30:00+00:00", status: "sold out" }, // not yet on sale
          { id: "101", iso: "2026-11-17T18:30:00+00:00", status: "sold out" }, // genuinely sold out
          { id: "102", iso: "2026-11-18T18:30:00+00:00", status: "sold out" }, // detail unreadable
        ],
      },
      { id: "2", name: "LATE FAME", events: [{ id: "200", iso: "2026-10-06T14:30:00+01:00" }] },
    ]);
  }

  it("fetches event detail only for events the feed calls sold out", async () => {
    const { requested } = await scrapeWith({
      [DAVID_LEAN_FEED_URL]: soldOutFeed(),
      [eventFeedUrl(SHOW, "100")]: eventDetailXml({ id: "100", available: 68, capacity: 68, onsale: "2026-10-08T09:00:00+01:00" }),
      [eventFeedUrl(SHOW, "101")]: eventDetailXml({ id: "101", available: 0, capacity: 68, onsale: "2026-09-01T09:00:00+01:00" }),
      [eventFeedUrl(SHOW, "102")]: new Error("HTTP 500: Internal Server Error"),
    });

    expect(requested).toEqual([
      DAVID_LEAN_FEED_URL,
      eventFeedUrl(SHOW, "100"),
      eventFeedUrl(SHOW, "101"),
      eventFeedUrl(SHOW, "102"),
    ]);
  });

  it("ingests not-yet-on-sale events without a sold-out flag, and flags only verified sell-outs", async () => {
    const { screenings } = await scrapeWith({
      [DAVID_LEAN_FEED_URL]: soldOutFeed(),
      [eventFeedUrl(SHOW, "100")]: eventDetailXml({ id: "100", available: 68, capacity: 68, onsale: "2026-10-08T09:00:00+01:00" }),
      [eventFeedUrl(SHOW, "101")]: eventDetailXml({ id: "101", available: 0, capacity: 68, onsale: "2026-09-01T09:00:00+01:00" }),
      [eventFeedUrl(SHOW, "102")]: new Error("HTTP 500: Internal Server Error"),
    });

    expect(screenings).toHaveLength(4);
    // On sale 8 Oct 09:00 BST, after "now": the "sold out" label is TicketSolve's
    // placeholder for "not on sale yet", so availability stays unknown.
    expect(byId(screenings, "100")?.availabilityStatus).toBeUndefined();
    expect(byId(screenings, "101")?.availabilityStatus).toBe("sold_out");
    // A sell-out needs the detail as evidence.
    expect(byId(screenings, "102")?.availabilityStatus).toBeUndefined();
    expect(byId(screenings, "200")?.availabilityStatus).toBe("available");
  });

  it("treats a missing onsale_time as not on sale", async () => {
    const feed = feedXml([
      { id: SHOW, name: "1 IN 2", events: [{ id: "100", iso: "2026-11-17T14:30:00+00:00", status: "sold out" }] },
    ]);

    const { screenings } = await scrapeWith({
      [DAVID_LEAN_FEED_URL]: feed,
      [eventFeedUrl(SHOW, "100")]: eventDetailXml({ id: "100", available: 0, capacity: 68 }),
    });

    expect(byId(screenings, "100")?.availabilityStatus).toBeUndefined();
  });

  it("stops fetching event detail after the first failure", async () => {
    const { screenings, requested } = await scrapeWith({
      [DAVID_LEAN_FEED_URL]: soldOutFeed(),
      [eventFeedUrl(SHOW, "100")]: new Error("The operation was aborted due to timeout"),
      [eventFeedUrl(SHOW, "101")]: eventDetailXml({ id: "101", available: 0, capacity: 68, onsale: "2026-09-01T09:00:00+01:00" }),
    });

    // One hung endpoint usually means all of them: 27 x 30s timeouts would
    // pass the runner's 600s venue cap.
    expect(requested).toEqual([DAVID_LEAN_FEED_URL, eventFeedUrl(SHOW, "100")]);
    expect(screenings).toHaveLength(4);
    expect(screenings.every((s) => s.availabilityStatus !== "sold_out")).toBe(true);
  });

  it("stops fetching event detail once its time budget is spent", async () => {
    const { requested } = await scrapeWith({
      [DAVID_LEAN_FEED_URL]: soldOutFeed(),
      [eventFeedUrl(SHOW, "100")]: () => {
        vi.setSystemTime(new Date(Date.now() + 61_000));
        return eventDetailXml({ id: "100", available: 68, capacity: 68, onsale: "2026-10-08T09:00:00+01:00" });
      },
      [eventFeedUrl(SHOW, "101")]: eventDetailXml({ id: "101", available: 0, capacity: 68, onsale: "2026-09-01T09:00:00+01:00" }),
    });

    expect(requested).toEqual([DAVID_LEAN_FEED_URL, eventFeedUrl(SHOW, "100")]);
  });
});
