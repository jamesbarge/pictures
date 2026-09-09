/**
 * PCC captured-source replay.
 *
 * Runs the REAL PrinceCharlesScraper over a byte-for-byte slice of a real
 * capture, with the clock pinned to the capture instant and the network mocked.
 * Nothing here builds an expected array and compares it with itself: the inputs
 * are the venue's own markup and the assertions are exact London/UTC instants.
 *
 * Fixture provenance (URL, capture time, sha256 of the full page) is recorded in
 * the fixture header: src/scrapers/utils/fixtures/pcc-whats-on-2026-09-09.html
 *
 * Offline replay proves the parser's behaviour on that capture. It does NOT
 * establish anything about production data.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// No DB in this test: the config overlay and the festival detector both query it.
vi.mock("@/db", () => ({ db: {}, withDbTimeout: async (p: unknown) => p }));
vi.mock("@/scrapers/festivals/festival-detector", () => ({
  FestivalDetector: { preload: async () => {}, detect: () => ({}) },
}));

import { createPrinceCharlesScraper } from "./prince-charles";
import { londonParts } from "../utils/date-parser";

const FIXTURE = readFileSync(
  join(__dirname, "../utils/fixtures/pcc-whats-on-2026-09-09.html"),
  "utf8",
);
/** The instant the fixture was captured: 17:30 London (BST) on Wed 9 Sep 2026. */
const CAPTURED_AT = new Date("2026-09-09T16:30:07Z");
/** The film in the extracted block, read from the fixture itself below. */
let CAPTURE_FILM = "";

const originalFetch = globalThis.fetch;

describe("PCC captured-source replay (real parser, pinned clock, mocked network)", () => {
  let screenings: Awaited<ReturnType<ReturnType<typeof createPrinceCharlesScraper>["scrape"]>>;

  beforeAll(async () => {
    // Fake ONLY Date: the scraper awaits its own rate-limit setTimeout, which a
    // fully faked clock would never advance.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(CAPTURED_AT);
    globalThis.fetch = vi.fn(async () =>
      new Response(FIXTURE, { status: 200, headers: { "content-type": "text/html" } }),
    ) as unknown as typeof fetch;

    screenings = await createPrinceCharlesScraper().scrape();
    // Take the title from the parse itself rather than restating it, so the
    // tuple assertions still catch a film/instant mismatch across rows.
    CAPTURE_FILM = screenings[0].filmTitle;
  }, 30_000);

  afterAll(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("resolves the capture-day screening to the capture day, not a year later", () => {
    // "Wednesday 9th September" + "5:45 pm" — the capture day itself.
    const sameDay = screenings.filter((s) => s.datetime.toISOString().startsWith("2026-09-09"));
    expect(sameDay.length).toBeGreaterThan(0);

    const row = sameDay[0];
    const l = londonParts(row.datetime);
    // Assert the whole tuple, so a right instant on the wrong film would fail.
    expect({
      datetime: row.datetime.toISOString(),
      london: `${l.year}-${String(l.month + 1).padStart(2, "0")}-${String(l.day).padStart(2, "0")} ${String(l.hours).padStart(2, "0")}:${String(l.minutes).padStart(2, "0")}`,
      filmTitle: row.filmTitle,
      sourceId: row.sourceId,
      bookingUrl: row.bookingUrl,
    }).toEqual({
      datetime: "2026-09-09T16:45:00.000Z", // 17:45 London (BST)
      london: "2026-09-09 17:45",
      filmTitle: CAPTURE_FILM,
      sourceId: "31627731",
      bookingUrl: "https://princecharlescinema.com/prince-charles-cinema/booknow/31627731",
    });

    // The defect signature: the same listing resolved a year out.
    expect(screenings.some((s) => s.datetime.toISOString().startsWith("2027-09-09"))).toBe(false);
  });

  it("resolves later same-year dates in BST and GMT to exact instants", () => {
    const tuple = (iso: string) => {
      const r = screenings.find((s) => s.datetime.toISOString() === iso);
      return r && { filmTitle: r.filmTitle, sourceId: r.sourceId, hasDeepLink: /booknow\/\d+$/.test(r.bookingUrl) };
    };
    // Tue 22 Sep, 6:15 pm — BST, so 17:15Z.
    expect(tuple("2026-09-22T17:15:00.000Z")).toEqual({ filmTitle: CAPTURE_FILM, sourceId: "31627380", hasDeepLink: true });
    // Thu 12 Nov, 12:00 pm — GMT, so 12:00Z. Confirms the BST/GMT switch.
    expect(tuple("2026-11-12T12:00:00.000Z")).toEqual({ filmTitle: CAPTURE_FILM, sourceId: "31628325", hasDeepLink: true });
    // Thu 17 Dec, 3:30 pm — GMT, so 15:30Z.
    expect(tuple("2026-12-17T15:30:00.000Z")?.hasDeepLink).toBe(true);

    // Every screening lands in the capture year; none is inferred into 2027.
    for (const s of screenings) expect(londonParts(s.datetime).year).toBe(2026);
  });

  it("reads the meridiem from the source rather than assuming PM", () => {
    // 12:00 pm is noon, not midnight — the source carries an explicit meridiem.
    const noon = screenings.filter((s) => londonParts(s.datetime).hours === 12);
    expect(noon.length).toBeGreaterThan(0);
    for (const s of noon) expect(londonParts(s.datetime).minutes).toBe(0);
  });
});
