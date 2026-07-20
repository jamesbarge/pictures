/**
 * Regression tests for the David Lean Cinema listing parser.
 *
 * This scraper returned ZERO screenings for its entire life because the
 * date regex required a bare 3-letter month ("Jun") while the site writes
 * full month names ("June") — "Jun" matched inside "June" but the trailing
 * "\s+at" then failed on the leftover "e". These fixtures encode that
 * failure mode plus the phantom-time bug ("11.00am" leaking a bare "00am"
 * into the bare-hour scan → 00:00 screenings).
 */
import { describe, expect, it } from "vitest";

import { DavidLeanScraper, isListingCandidateText } from "./david-lean";

// Fixed clock: 2026-06-12 (BST). June dates parse as UTC+1 → UTC-1h.
const NOW = new Date("2026-06-12T08:00:00Z");
const CURRENT_YEAR = 2026;

function parse(text: string) {
  const scraper = new DavidLeanScraper();
  return scraper.parseListingText(text, "https://tinyurl.com/example", CURRENT_YEAR, NOW);
}

describe("DavidLeanScraper.parseListingText", () => {
  it("parses full month names with multiple showtimes (the never-worked failure mode)", () => {
    const screenings = parse(
      "Fairyland\n2024 | USA | 105 min\nTues 16 June at 2.30pm and 7.30pm"
    );

    expect(screenings).toHaveLength(2);
    expect(screenings[0].filmTitle).toBe("Fairyland");
    // 14:30 / 19:30 London (BST) → 13:30 / 18:30 UTC
    expect(screenings.map((s) => s.datetime.toISOString())).toEqual([
      "2026-06-16T13:30:00.000Z",
      "2026-06-16T18:30:00.000Z",
    ]);
  });

  it("still parses abbreviated month names", () => {
    const screenings = parse("Some Film\nWed 17 Jun at 7.30pm");

    expect(screenings).toHaveLength(1);
    expect(screenings[0].datetime.toISOString()).toBe("2026-06-17T18:30:00.000Z");
  });

  it("parses morning shows without emitting phantom 00:xx screenings", () => {
    // "11.00am" previously leaked a bare "00am" into the bare-hour scan.
    const screenings = parse("Who Framed Roger Rabbit?\nSat 20 June at 11.00am");

    expect(screenings).toHaveLength(1);
    // 11:00 London (BST) → 10:00 UTC
    expect(screenings[0].datetime.toISOString()).toBe("2026-06-20T10:00:00.000Z");
    expect(
      screenings.some((s) => s.datetime.getUTCHours() < 8)
    ).toBe(false);
  });

  it("drops recently-past dates without bumping them a year forward", () => {
    // 10 June is 2 days before NOW: must be dropped, not become June 2027.
    const screenings = parse("Old Show\nWed 10 June at 7.30pm");

    expect(screenings).toHaveLength(0);
  });

  it("returns no screenings for text with no date pattern", () => {
    expect(parse("Coming soon: programme TBC")).toHaveLength(0);
  });

  it("uses the film title embedded after ' - ' in special-screening announcement blocks", () => {
    // These blocks put an intro SENTENCE on line 0 and the real title AFTER the
    // time on each date line. The pre-fix parser used line 0 (the sentence) as
    // the title for every screening, producing "films" named after the sentence.
    const screenings = parse(
      "We have two special screenings in August which include Q&A's:\n" +
        "Wednesday 05 August at 7.00pm - ALL OF US STRANGERS plus Q&A\n" +
        "Tuesday 18 August at 7.00pm - COME SEE ME IN THE GOOD LIGHT plus Q&A"
    );

    expect(screenings).toHaveLength(2);
    expect(screenings.map((s) => s.filmTitle)).toEqual([
      "ALL OF US STRANGERS",
      "COME SEE ME IN THE GOOD LIGHT",
    ]);
    // 19:00 London (BST) → 18:00 UTC, and the sentence never becomes a title.
    expect(screenings.map((s) => s.datetime.toISOString())).toEqual([
      "2026-08-05T18:00:00.000Z",
      "2026-08-18T18:00:00.000Z",
    ]);
  });

  it("keeps the block title for normal listings and handles bare-hour times", () => {
    // extractTimes()/parseListingText() already handle a bare-hour first time
    // ("11am") correctly, and a normal block (no ' - ') keeps its line-0 title.
    // This does NOT cover the Toy Story 5 regression itself — see the
    // isListingCandidateText test below for that (parseListingText is never
    // reached for a block the DOM filter drops before scrape() calls it).
    const screenings = parse(
      "Toy Story 5\n2026 | USA | 102 min\nThurs 20 Aug at 11am, 2.30pm (HOH) and 7.00pm"
    );

    expect(screenings).toHaveLength(3);
    expect(new Set(screenings.map((s) => s.filmTitle))).toEqual(new Set(["Toy Story 5"]));
    // 11:00 / 14:30 / 19:00 London (BST) → 10:00 / 13:30 / 18:00 UTC.
    expect(screenings.map((s) => s.datetime.toISOString()).sort()).toEqual([
      "2026-08-20T10:00:00.000Z",
      "2026-08-20T13:30:00.000Z",
      "2026-08-20T18:00:00.000Z",
    ]);
    expect(screenings.some((s) => s.datetime.getUTCHours() < 8)).toBe(false);
  });

  it("does not misread a time-range's end time as an embedded film title", () => {
    // A normal listing could plausibly write a time RANGE with the same
    // " - " separator the special-screening blocks use for an embedded title
    // (e.g. "10.00am - 12.00pm"). Without a guard, splitEmbeddedTitle() would
    // misread "12.00pm" as the film title and silently drop the screening.
    const screenings = parse("Some Film\nSat 20 June at 10.00am - 12.00pm");

    expect(screenings.length).toBeGreaterThan(0);
    expect(screenings.every((s) => s.filmTitle === "Some Film")).toBe(true);
  });
});

describe("isListingCandidateText (DOM-filter regex, hand-synced with scrape())", () => {
  it("accepts a bare-hour showtime — the Toy Story 5 regression", () => {
    // Pre-fix, the DOM filter required minutes after "at" and dropped this
    // entire block before parseListingText ever ran, so Toy Story 5 never
    // appeared in the scrape output at all.
    expect(
      isListingCandidateText("Toy Story 5\n2026 | USA | 102 min\nThurs 20 Aug at 11am, 2.30pm (HOH) and 7.00pm")
    ).toBe(true);
  });

  it("accepts a listing with full minutes", () => {
    expect(isListingCandidateText("Fairyland\n2024 | USA | 105 min\nTues 16 June at 2.30pm and 7.30pm")).toBe(true);
  });

  it("rejects text with no date+time pattern", () => {
    expect(isListingCandidateText("Coming soon: programme TBC")).toBe(false);
  });
});
