/**
 * Peckhamplex time provenance regression.
 *
 * The venue publishes `<time datetime="2026-09-10T16:45">16:45</time>` with no
 * zone designator, and the visible clock and analytics label on the same
 * button agree with the attribute (captured 2026-09-10, see
 * __fixtures__/peckhamplex/PROVENANCE.json). That value is London local time.
 *
 * These tests pin the contract through the production seam
 * (`PeckhamplexScraper.scrape()` with `fetch` stubbed):
 *   - BST date: 16:45 local  -> 15:45Z
 *   - GMT date: 16:45 local  -> 16:45Z
 *   - sourceId embeds the stored UTC instant
 *
 * Storing the attribute as if it were UTC (`2026-09-10T16:45:00Z`) renders as
 * 17:45 BST, one hour late. Rows with exactly that shape were observed in
 * production on 2026-09-08, 2026-09-09 and 2026-09-10 next to this scraper's
 * correct rows; the pre-2026-05-11 conversion (`new Date(y, m, d, h, mi)` on a
 * UTC host) produces it. This file makes that regression fail loudly if it ever
 * returns to this scraper.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeckhamplexScraper } from "./peckhamplex";

const DIR = join(__dirname, "__fixtures__", "peckhamplex");
const read = (name: string) => readFileSync(join(DIR, name), "utf8");

const LISTING_OUT_NOW = read("listing-out-now.html");
const LISTING_EMPTY = read("listing-empty.html");
const FILM_BST = read("film-spider-man-bst.html");
const FILM_GMT = read("film-spider-man-gmt.html");

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
}

/** Serve fixtures by URL path; the film page body is chosen per test. */
function stubFetch(filmPage: string) {
  const calls: string[] = [];
  const mockFetch = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (url.endsWith("/films/out-now")) return htmlResponse(LISTING_OUT_NOW);
    if (url.endsWith("/films/coming-soon")) return htmlResponse(LISTING_EMPTY);
    if (url.endsWith("/film/spider-man-brand-new-day")) return htmlResponse(filmPage);
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", mockFetch);
  return { mockFetch, calls };
}

function scraperWithoutDelays(): PeckhamplexScraper {
  const scraper = new PeckhamplexScraper();
  // The production config waits 2s between requests. The seam under test is
  // parsing, so remove the pause instead of faking timers around fetch.
  scraper.config = { ...scraper.config, delayBetweenRequests: 0 };
  return scraper;
}

describe("PeckhamplexScraper — <time datetime> is London local time", () => {
  beforeEach(() => {
    // Fake only Date: the scraper's delay() uses setTimeout, which must keep running.
    vi.useFakeTimers({ toFake: ["Date"] });
    // Pin "now" before every fixture showtime so validate() keeps them. The
    // fixtures carry real 2026 dates; without this the test dies once those
    // dates pass.
    vi.setSystemTime(new Date("2026-09-10T08:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("BST: stores 16:45 local as 15:45Z and embeds that instant in sourceId", async () => {
    stubFetch(FILM_BST);
    const screenings = await scraperWithoutDelays().scrape();

    expect(screenings.map((s) => s.datetime.toISOString())).toEqual([
      "2026-09-10T15:45:00.000Z",
      "2026-09-12T13:00:00.000Z",
      "2026-09-12T16:10:00.000Z",
    ]);
    expect(screenings[0]).toMatchObject({
      filmTitle: "Spider-Man: Brand New Day",
      sourceId: "peckhamplex-spider-man-brand-new-day-2026-09-10T15:45:00.000Z",
      bookingUrl: "https://ticketing.eu.veezi.com/purchase/83098?siteToken=zkD3Bh7H%2fkuZI9VTgCj%2bgg%3d%3d",
    });

    // The one-hour-late shape must never come out of this scraper.
    expect(screenings.map((s) => s.datetime.toISOString())).not.toContain("2026-09-10T16:45:00.000Z");
  });

  it("GMT: stores 16:45 local as 16:45Z (no offset outside summer time)", async () => {
    stubFetch(FILM_GMT);
    const screenings = await scraperWithoutDelays().scrape();

    expect(screenings.map((s) => s.datetime.toISOString())).toEqual([
      "2026-12-10T16:45:00.000Z",
      "2026-12-12T14:00:00.000Z",
      "2026-12-12T17:10:00.000Z",
    ]);
    expect(screenings[0].sourceId).toBe(
      "peckhamplex-spider-man-brand-new-day-2026-12-10T16:45:00.000Z"
    );
  });

  it("result does not depend on the host timezone", async () => {
    // ukLocalToUTC builds the instant from components, so TZ must be irrelevant.
    // Vitest runs with the host's TZ; assert the same instants that a UTC host
    // and a London host would both produce.
    stubFetch(FILM_BST);
    const [first] = await scraperWithoutDelays().scrape();
    expect(first.datetime.getTime()).toBe(Date.UTC(2026, 8, 10, 15, 45));
  });

  it("fetches both listings and then each film page once", async () => {
    const { calls } = stubFetch(FILM_BST);
    await scraperWithoutDelays().scrape();
    expect(calls).toEqual([
      "https://www.peckhamplex.london/films/out-now",
      "https://www.peckhamplex.london/films/coming-soon",
      "https://www.peckhamplex.london/film/spider-man-brand-new-day",
    ]);
  });
});
