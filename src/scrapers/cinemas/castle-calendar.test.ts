import { describe, it, expect } from "vitest";
import { parseCalendarPage, validateScreenings } from "./castle-calendar";

/**
 * Tests for the shared Castle / Castle Sidcup calendar parser.
 *
 * Background: the previous Castle scrapers parsed homepage JSON-LD which only
 * surfaces ~7 days of programming. /calendar/ is the source of truth and
 * exposes every performance via .performance-button elements with
 * data-perf-id, data-start-time, and href attributes. Each button's film
 * title is the most recent preceding <h1> in document order.
 */

const BASE_URL = "https://thecastlecinema.com";

const SAMPLE_HTML = `
<html>
<body>
<h3 class="date">Wed, 6 May</h3>
<div class="film-card">
  <h1>The Devil Wears Prada 2</h1>
  <p>Description goes here.</p>
  <div class="film-times">
    <a class="performance-button button sm "
       data-perf-id="16468"
       data-filters=""
       data-start-time="2026-05-06T16:00:00"
       href="/bookings/16468/">16:00</a>
    <a class="performance-button button sm "
       data-perf-id="16466"
       data-filters=""
       data-start-time="2026-05-06T18:30:00"
       href="/bookings/16466/">18:30</a>
  </div>
</div>
<div class="film-card">
  <h1>Pitchblack Playback: The Beach Boys 'Pet Sounds' (5.1 Mix)</h1>
  <div class="film-times">
    <a class="performance-button button sm "
       data-perf-id="16310"
       data-filters=""
       data-start-time="2026-05-06T21:00:00"
       href="/bookings/16310/">21:00</a>
  </div>
</div>
<h3 class="date">Thu, 28 May</h3>
<div class="film-card">
  <h1>Mickey 17</h1>
  <div class="film-times">
    <a class="performance-button button sm "
       data-perf-id="15371"
       data-filters=""
       data-start-time="2026-05-28T19:00:00"
       href="/bookings/15371/">19:00</a>
  </div>
</div>
</body>
</html>
`;

describe("parseCalendarPage", () => {
  it("extracts every performance button as a screening", () => {
    const screenings = parseCalendarPage(SAMPLE_HTML, "castle", BASE_URL);
    expect(screenings).toHaveLength(4);
  });

  it("resolves film titles by walking back to the nearest preceding <h1>", () => {
    const screenings = parseCalendarPage(SAMPLE_HTML, "castle", BASE_URL);
    expect(screenings.map((s) => s.filmTitle)).toEqual([
      "The Devil Wears Prada 2",
      "The Devil Wears Prada 2",
      "Pitchblack Playback: The Beach Boys 'Pet Sounds' (5.1 Mix)",
      "Mickey 17",
    ]);
  });

  it("includes booking IDs further out than the homepage window (regression for the original bug)", () => {
    const screenings = parseCalendarPage(SAMPLE_HTML, "castle", BASE_URL);
    const perfIds = screenings.map((s) => s.sourceId);
    // 15371 is on 2026-05-28, well past the ~7-day homepage horizon
    expect(perfIds).toContain("castle-15371");
  });

  it("namespaces source IDs with the prefix to keep Castle and Sidcup distinct", () => {
    const sidcupScreenings = parseCalendarPage(SAMPLE_HTML, "castle-sidcup", BASE_URL);
    expect(sidcupScreenings[0].sourceId).toBe("castle-sidcup-16468");
  });

  it("converts data-start-time (UK local) to UTC accounting for BST", () => {
    const screenings = parseCalendarPage(SAMPLE_HTML, "castle", BASE_URL);
    // 2026-05-06 16:00 UK local is during BST (UTC+1) → 15:00 UTC
    expect(screenings[0].datetime.toISOString()).toBe("2026-05-06T15:00:00.000Z");
  });

  it("builds absolute booking URLs from relative hrefs", () => {
    const screenings = parseCalendarPage(SAMPLE_HTML, "castle", BASE_URL);
    expect(screenings[0].bookingUrl).toBe("https://thecastlecinema.com/bookings/16468/");
  });

  it("returns an empty array when the calendar has no performance buttons", () => {
    const empty = `<html><body><h3 class="date">Wed, 6 May</h3></body></html>`;
    expect(parseCalendarPage(empty, "castle", BASE_URL)).toEqual([]);
  });

  it("skips a performance button that has no preceding <h1>", () => {
    // A malformed page where the button appears before any film title heading
    const orphan = `
      <h3 class="date">Wed, 6 May</h3>
      <a class="performance-button button sm "
         data-perf-id="999"
         data-filters=""
         data-start-time="2026-05-06T16:00:00"
         href="/bookings/999/">16:00</a>
      <h1>The Devil Wears Prada 2</h1>
    `;
    expect(parseCalendarPage(orphan, "castle", BASE_URL)).toEqual([]);
  });

  it("ignores <h1> elements outside the calendar block (page chrome)", () => {
    // Site header has its own <h1> that must NOT be inherited by the first
    // film card if no in-calendar <h1> precedes it.
    const withChrome = `
      <header><h1>The Castle Cinema</h1></header>
      <h3 class="date">Wed, 6 May</h3>
      <a class="performance-button button sm "
         data-perf-id="100"
         data-filters=""
         data-start-time="2026-05-06T16:00:00"
         href="/bookings/100/">16:00</a>
      <h1>Real Film Title</h1>
      <a class="performance-button button sm "
         data-perf-id="101"
         data-filters=""
         data-start-time="2026-05-06T18:00:00"
         href="/bookings/101/">18:00</a>
    `;
    const screenings = parseCalendarPage(withChrome, "castle", BASE_URL);
    // perf 100 appears before any calendar-scoped <h1> → dropped
    // perf 101 inherits "Real Film Title", not the page-chrome "The Castle Cinema"
    expect(screenings).toHaveLength(1);
    expect(screenings[0].filmTitle).toBe("Real Film Title");
    expect(screenings[0].sourceId).toBe("castle-101");
  });

  it("decodes common HTML entities in film titles", () => {
    const entityHtml = `
      <h3 class="date">Wed, 6 May</h3>
      <h1>Schindler&apos;s List</h1>
      <a class="performance-button button sm "
         data-perf-id="200"
         data-filters=""
         data-start-time="2026-05-06T19:00:00"
         href="/bookings/200/">19:00</a>
      <h1>Tom &amp; Jerry &ndash; Big Adventure</h1>
      <a class="performance-button button sm "
         data-perf-id="201"
         data-filters=""
         data-start-time="2026-05-06T20:00:00"
         href="/bookings/201/">20:00</a>
    `;
    const screenings = parseCalendarPage(entityHtml, "castle", BASE_URL);
    expect(screenings.map((s) => s.filmTitle)).toEqual([
      "Schindler's List",
      "Tom & Jerry – Big Adventure",
    ]);
  });

  it("throws when performance-button tags exist but none parse — signals template drift", () => {
    // Wagtail template change: data-perf-id removed, replaced with data-id
    const drifted = `
      <h3 class="date">Wed, 6 May</h3>
      <h1>Some Film</h1>
      <a class="performance-button button sm "
         data-id="999"
         data-start-time="2026-05-06T19:00:00"
         href="/bookings/999/">19:00</a>
      <a class="performance-button button sm "
         data-id="1000"
         data-start-time="2026-05-06T21:00:00"
         href="/bookings/1000/">21:00</a>
    `;
    expect(() => parseCalendarPage(drifted, "castle", BASE_URL)).toThrow(
      /performance-button tag.*parsed 0/i,
    );
  });
});

describe("validateScreenings", () => {
  it("filters past screenings", () => {
    const past: Parameters<typeof validateScreenings>[0] = [
      {
        filmTitle: "Old Movie",
        datetime: new Date("2020-01-01T12:00:00Z"),
        bookingUrl: "https://example.com/old",
        sourceId: "castle-1",
      },
      {
        filmTitle: "Future Movie",
        datetime: new Date(Date.now() + 86_400_000),
        bookingUrl: "https://example.com/future",
        sourceId: "castle-2",
      },
    ];
    const valid = validateScreenings(past);
    expect(valid).toHaveLength(1);
    expect(valid[0].filmTitle).toBe("Future Movie");
  });

  it("dedupes by sourceId", () => {
    const future = new Date(Date.now() + 86_400_000);
    const dupes: Parameters<typeof validateScreenings>[0] = [
      { filmTitle: "A", datetime: future, bookingUrl: "https://x/1", sourceId: "castle-1" },
      { filmTitle: "A", datetime: future, bookingUrl: "https://x/1", sourceId: "castle-1" },
    ];
    expect(validateScreenings(dupes)).toHaveLength(1);
  });

  it("rejects entries with missing fields", () => {
    const future = new Date(Date.now() + 86_400_000);
    const bad: Parameters<typeof validateScreenings>[0] = [
      { filmTitle: "", datetime: future, bookingUrl: "https://x/1" },
      { filmTitle: "A", datetime: new Date("invalid"), bookingUrl: "https://x/1" },
      { filmTitle: "A", datetime: future, bookingUrl: "" },
    ];
    expect(validateScreenings(bad)).toEqual([]);
  });
});
