import { describe, expect, it } from "vitest";
import { parseVEvents } from "./ical-parser";

const VEVENT = (props: Record<string, string>): string => {
  const lines = ["BEGIN:VEVENT"];
  for (const [k, v] of Object.entries(props)) lines.push(`${k}:${v}`);
  lines.push("END:VEVENT");
  return lines.join("\r\n");
};

const wrap = (event: string): string =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", event, "END:VCALENDAR"].join("\r\n");

describe("parseVEvents", () => {
  it("parses a minimal valid VEVENT", () => {
    const ical = wrap(
      VEVENT({
        UID: "abc-123",
        SUMMARY: "Citizen Kane",
        DTSTART: "20260516T193000",
      }),
    );
    const events = parseVEvents(ical);
    expect(events).toHaveLength(1);
    expect(events[0].uid).toBe("abc-123");
    expect(events[0].summary).toBe("Citizen Kane");
    expect(events[0].dtStartUKLocal).toEqual({
      year: 2026,
      month: 4, // 0-indexed (May)
      day: 16,
      hour: 19,
      minute: 30,
    });
    expect(events[0].categories).toEqual([]);
    expect(events[0].url).toBeUndefined();
  });

  it("captures URL and CATEGORIES when present", () => {
    const ical = wrap(
      VEVENT({
        UID: "xyz",
        SUMMARY: "Vertigo",
        DTSTART: "20260101T200000",
        URL: "https://example.com/event/xyz",
        CATEGORIES: "Film, 35mm , ",
      }),
    );
    const events = parseVEvents(ical);
    expect(events[0].url).toBe("https://example.com/event/xyz");
    // Empty/whitespace-only categories are stripped.
    expect(events[0].categories).toEqual(["Film", "35mm"]);
  });

  it("unescapes \\, \\; \\\\ and \\n in SUMMARY", () => {
    const ical = wrap(
      VEVENT({
        UID: "u",
        SUMMARY: String.raw`Title\, with comma\; semi\\ backslash\n newline`,
        DTSTART: "20260101T200000",
      }),
    );
    const events = parseVEvents(ical);
    // `\n` → " " per the implementation (uses ` ` not `\n`).
    expect(events[0].summary).toBe(
      "Title, with comma; semi\\ backslash  newline",
    );
  });

  it("handles RFC 5545 line folding (continuation lines starting with space)", () => {
    // Fold UID across two lines — the continuation joined directly.
    const ical = wrap(
      "BEGIN:VEVENT\r\nUID:long-line-c\r\n ontinued\r\nSUMMARY:X\r\nDTSTART:20260101T200000\r\nEND:VEVENT",
    );
    const events = parseVEvents(ical);
    expect(events[0].uid).toBe("long-line-continued");
  });

  it("returns empty array for an iCal feed with no VEVENTs", () => {
    const ical = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR";
    expect(parseVEvents(ical)).toEqual([]);
  });

  it("returns empty array for input with no BEGIN/END markers", () => {
    expect(parseVEvents("")).toEqual([]);
    expect(parseVEvents("not a calendar")).toEqual([]);
  });

  it("drops a VEVENT missing the required UID/SUMMARY/DTSTART fields", () => {
    const ical = wrap(
      VEVENT({
        UID: "incomplete-1",
        // missing SUMMARY
        DTSTART: "20260101T200000",
      }),
    );
    expect(parseVEvents(ical)).toEqual([]);
  });

  it("parses DTSTART with TZID param (ignores the param value — assumes Europe/London)", () => {
    const ical = wrap(
      "BEGIN:VEVENT\r\nUID:tz1\r\nSUMMARY:S\r\nDTSTART;TZID=Europe/London:20260516T193000\r\nEND:VEVENT",
    );
    const events = parseVEvents(ical);
    expect(events).toHaveLength(1);
    expect(events[0].dtStartUKLocal.hour).toBe(19);
  });

  it("silently skips DTSTART values that don't match the YYYYMMDDTHHmmss pattern", () => {
    const ical = wrap(
      VEVENT({
        UID: "weird",
        SUMMARY: "S",
        DTSTART: "20260516T1930", // missing seconds — won't match
      }),
    );
    // Without DTSTART parsing, event is discarded (no dtStartUKLocal).
    expect(parseVEvents(ical)).toEqual([]);
  });

  it("returns 0-indexed month in the parsed output", () => {
    // RFC 5545 January = 01 in the wire format. We must return 0 for January
    // to match Date constructor convention.
    const ical = wrap(
      VEVENT({
        UID: "jan",
        SUMMARY: "S",
        DTSTART: "20260101T200000",
      }),
    );
    expect(parseVEvents(ical)[0].dtStartUKLocal.month).toBe(0); // January
  });

  it("parses multiple VEVENTs in a single feed", () => {
    const ical = [
      "BEGIN:VCALENDAR",
      VEVENT({ UID: "1", SUMMARY: "A", DTSTART: "20260101T200000" }),
      VEVENT({ UID: "2", SUMMARY: "B", DTSTART: "20260102T200000" }),
      "END:VCALENDAR",
    ].join("\r\n");
    const events = parseVEvents(ical);
    expect(events).toHaveLength(2);
    expect(events[0].uid).toBe("1");
    expect(events[1].uid).toBe("2");
  });

  it("skips unknown properties (X-, VALARM nested blocks, etc.)", () => {
    const ical = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:u",
      "X-FOO:bar",
      "SUMMARY:S",
      "X-MICROSOFT-CDO-BUSYSTATUS:BUSY",
      "DTSTART:20260101T200000",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const events = parseVEvents(ical);
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe("S");
  });

  it("ignores properties outside the BEGIN/END VEVENT window", () => {
    const ical = [
      "BEGIN:VCALENDAR",
      "PRODID:-//Some//Calendar//EN",
      "VERSION:2.0",
      VEVENT({ UID: "u", SUMMARY: "S", DTSTART: "20260101T200000" }),
      "END:VCALENDAR",
    ].join("\r\n");
    const events = parseVEvents(ical);
    expect(events).toHaveLength(1);
  });
});
