import { describe, expect, it } from "vitest";
import { CinemaMuseumScraper, parseVEvents } from "./cinema-museum";

/**
 * Fixture derived from a real cinemamuseum.org.uk iCal feed slice
 * (2026-05-15). Three event types in one feed: a museum tour (must be
 * filtered out), a film screening, and a talk-style event with escaped
 * commas/special chars in the SUMMARY.
 */
const ICAL_FIXTURE = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//The Cinema Museum - ECPv6.15.18//NONSGML v1.0//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VTIMEZONE
TZID:Europe/London
BEGIN:DAYLIGHT
TZOFFSETFROM:+0000
TZOFFSETTO:+0100
TZNAME:BST
DTSTART:20260329T010000
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=Europe/London:20260516T110000
DTEND;TZID=Europe/London:20260516T130000
UID:11677-1778929200-1778936400@cinemamuseum.org.uk
SUMMARY:Museum Tour - Morning
URL:https://cinemamuseum.org.uk/scheduled/museum-tour-morning-7/
CATEGORIES:Tours
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Europe/London:20260516T193000
DTEND;TZID=Europe/London:20260516T220000
UID:11758-1778959800-1778968800@cinemamuseum.org.uk
SUMMARY:50th anniversary of Aces High (1976)
URL:https://cinemamuseum.org.uk/scheduled/aces-high/
CATEGORIES:Cinema Museum 35mm Film Classics
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Europe/London:20260520T193000
DTEND;TZID=Europe/London:20260520T220000
UID:11800-1779299400-1779308400@cinemamuseum.org.uk
SUMMARY:Film\\, Sound\\, Music and Entertainment 1894 - 1929
URL:https://cinemamuseum.org.uk/scheduled/film-sound-music/
CATEGORIES:Kennington Bioscope
END:VEVENT
END:VCALENDAR`;

describe("parseVEvents (iCal parser)", () => {
  it("extracts all VEVENT blocks", () => {
    const events = parseVEvents(ICAL_FIXTURE);
    expect(events).toHaveLength(3);
  });

  it("parses UID, SUMMARY, URL, and CATEGORIES correctly", () => {
    const events = parseVEvents(ICAL_FIXTURE);
    expect(events[0].uid).toBe("11677-1778929200-1778936400@cinemamuseum.org.uk");
    expect(events[0].summary).toBe("Museum Tour - Morning");
    expect(events[0].url).toBe("https://cinemamuseum.org.uk/scheduled/museum-tour-morning-7/");
    expect(events[0].categories).toEqual(["Tours"]);
  });

  it("unescapes \\, in SUMMARY (RFC 5545 TEXT escape)", () => {
    const events = parseVEvents(ICAL_FIXTURE);
    expect(events[2].summary).toBe("Film, Sound, Music and Entertainment 1894 - 1929");
  });

  it("parses DTSTART local time correctly (timezone embedded in TZID parameter)", () => {
    const events = parseVEvents(ICAL_FIXTURE);
    expect(events[1].dtStartUKLocal).toEqual({
      year: 2026,
      month: 4, // May (0-indexed)
      day: 16,
      hour: 19,
      minute: 30,
    });
  });
});

describe("CinemaMuseumScraper.parseICal", () => {
  const scraper = new CinemaMuseumScraper();

  it("emits 2 screenings and filters out the 'Tours' category", () => {
    const screenings = scraper.parseICal(ICAL_FIXTURE);
    expect(screenings).toHaveLength(2);
    expect(screenings.find((s) => s.filmTitle.startsWith("Museum Tour"))).toBeUndefined();
  });

  it("converts UK local DTSTART to correct UTC (BST → -1h)", () => {
    const screenings = scraper.parseICal(ICAL_FIXTURE);
    // 2026-05-16 19:30 BST → 18:30 UTC
    const aces = screenings.find((s) => s.filmTitle.includes("Aces High"));
    expect(aces?.datetime.toISOString()).toBe("2026-05-16T18:30:00.000Z");
  });

  it("prefixes the UID with 'cinema-museum-' for sourceId namespace safety", () => {
    const screenings = scraper.parseICal(ICAL_FIXTURE);
    for (const s of screenings) {
      expect(s.sourceId?.startsWith("cinema-museum-")).toBe(true);
    }
  });

  it("uses the event URL as bookingUrl", () => {
    const screenings = scraper.parseICal(ICAL_FIXTURE);
    const aces = screenings.find((s) => s.filmTitle.includes("Aces High"));
    expect(aces?.bookingUrl).toBe("https://cinemamuseum.org.uk/scheduled/aces-high/");
  });

  it("preserves unescaped title characters", () => {
    const screenings = scraper.parseICal(ICAL_FIXTURE);
    const film = screenings.find((s) => s.filmTitle.includes("Film,"));
    expect(film?.filmTitle).toBe("Film, Sound, Music and Entertainment 1894 - 1929");
  });

  it("returns [] for an empty feed", () => {
    const empty = "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR";
    expect(scraper.parseICal(empty)).toEqual([]);
  });

  it("handles line-folding (continuation lines)", () => {
    const folded =
      "BEGIN:VEVENT\r\n" +
      "DTSTART;TZID=Europe/London:20260516T193000\r\n" +
      "UID:test-1@cinemamuseum.org.uk\r\n" +
      "SUMMARY:This is a very long title that has been\r\n" +
      "  folded onto a continuation line per RFC 5545\r\n" +
      "URL:https://example.test/\r\n" +
      "CATEGORIES:Events\r\n" +
      "END:VEVENT";
    const events = parseVEvents(folded);
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe(
      "This is a very long title that has been folded onto a continuation line per RFC 5545",
    );
  });
});
