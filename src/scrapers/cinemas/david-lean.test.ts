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

import { DavidLeanScraper } from "./david-lean";

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
});
