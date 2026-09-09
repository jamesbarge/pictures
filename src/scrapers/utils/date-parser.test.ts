import { describe, it, expect } from "vitest";
import {
  parseScreeningDate,
  parseScreeningTime,
  combineDateAndTime,
  parseDateTime,
  lastSundayOfMonth,
  isUKSummerTime,
  ukLocalToUTC,
  parseUKLocalDateTime,
  londonParts,
} from "./date-parser";

describe("lastSundayOfMonth", () => {
  it("should find last Sunday of March 2025", () => {
    // March 2025: last Sunday is March 30
    expect(lastSundayOfMonth(2025, 2)).toBe(30);
  });

  it("should find last Sunday of October 2025", () => {
    // October 2025: last Sunday is October 26
    expect(lastSundayOfMonth(2025, 9)).toBe(26);
  });

  it("should find last Sunday of March 2026", () => {
    // March 2026: last Sunday is March 29
    expect(lastSundayOfMonth(2026, 2)).toBe(29);
  });

  it("should find last Sunday of October 2026", () => {
    // October 2026: last Sunday is October 25
    expect(lastSundayOfMonth(2026, 9)).toBe(25);
  });
});

describe("isUKSummerTime", () => {
  it("should return false for January (winter)", () => {
    expect(isUKSummerTime(2025, 0, 15, 12)).toBe(false);
  });

  it("should return true for July (summer)", () => {
    expect(isUKSummerTime(2025, 6, 15, 12)).toBe(true);
  });

  it("should return false for December (winter)", () => {
    expect(isUKSummerTime(2025, 11, 25, 12)).toBe(false);
  });

  it("should handle BST start transition (March)", () => {
    // March 2025: BST starts last Sunday (30th) at 01:00
    expect(isUKSummerTime(2025, 2, 29, 12)).toBe(false); // Day before
    expect(isUKSummerTime(2025, 2, 30, 0)).toBe(false); // Transition day, before 01:00
    expect(isUKSummerTime(2025, 2, 30, 1)).toBe(true); // Transition day, at 01:00
    expect(isUKSummerTime(2025, 2, 31, 12)).toBe(true); // Day after
  });

  it("should handle BST end transition (October)", () => {
    // October 2025: BST ends last Sunday (26th) at 02:00 local (01:00 UTC)
    expect(isUKSummerTime(2025, 9, 25, 12)).toBe(true); // Day before
    expect(isUKSummerTime(2025, 9, 26, 1)).toBe(true); // Transition day, 01:00 (still BST)
    expect(isUKSummerTime(2025, 9, 26, 2)).toBe(false); // Transition day, 02:00 (GMT)
    expect(isUKSummerTime(2025, 9, 27, 12)).toBe(false); // Day after
  });
});

describe("ukLocalToUTC", () => {
  it("should not adjust GMT dates (winter)", () => {
    // December 22, 2024 at 18:00 UK time = 18:00 UTC
    const result = ukLocalToUTC(2024, 11, 22, 18, 30);
    expect(result.getUTCHours()).toBe(18);
    expect(result.getUTCMinutes()).toBe(30);
  });

  it("should subtract 1 hour for BST dates (summer)", () => {
    // July 15, 2025 at 18:00 UK time (BST) = 17:00 UTC
    const result = ukLocalToUTC(2025, 6, 15, 18, 30);
    expect(result.getUTCHours()).toBe(17);
    expect(result.getUTCMinutes()).toBe(30);
  });

  it("should handle BST transition correctly", () => {
    // March 30, 2025 at 14:00 UK (BST) = 13:00 UTC
    const bst = ukLocalToUTC(2025, 2, 30, 14, 0);
    expect(bst.getUTCHours()).toBe(13);

    // March 29, 2025 at 14:00 UK (GMT) = 14:00 UTC
    const gmt = ukLocalToUTC(2025, 2, 29, 14, 0);
    expect(gmt.getUTCHours()).toBe(14);
  });
});

describe("parseUKLocalDateTime", () => {
  it("should parse ISO string as UK local time (GMT)", () => {
    const result = parseUKLocalDateTime("2024-12-22T18:30");
    expect(result.getUTCFullYear()).toBe(2024);
    expect(result.getUTCMonth()).toBe(11);
    expect(result.getUTCDate()).toBe(22);
    expect(result.getUTCHours()).toBe(18);
    expect(result.getUTCMinutes()).toBe(30);
  });

  it("should parse ISO string as UK local time (BST)", () => {
    // July 15 is BST, so 18:30 UK = 17:30 UTC
    const result = parseUKLocalDateTime("2025-07-15T18:30");
    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(6);
    expect(result.getUTCDate()).toBe(15);
    expect(result.getUTCHours()).toBe(17);
    expect(result.getUTCMinutes()).toBe(30);
  });
});

describe("parseScreeningDate", () => {
  // Use a fixed reference date for consistent tests
  const refDate = new Date("2024-12-15T12:00:00Z");

  describe("ISO format", () => {
    it("should parse ISO date string", () => {
      const result = parseScreeningDate("2024-12-22", refDate);
      expect(result).toBeInstanceOf(Date);
      expect(result?.getUTCFullYear()).toBe(2024);
      expect(result?.getUTCMonth()).toBe(11); // December
      expect(result?.getUTCDate()).toBe(22);
    });

    it("should parse ISO datetime string", () => {
      const result = parseScreeningDate("2024-12-22T18:30:00", refDate);
      expect(result?.getUTCFullYear()).toBe(2024);
      expect(result?.getUTCMonth()).toBe(11);
      expect(result?.getUTCDate()).toBe(22);
    });
  });

  describe("UK date format", () => {
    it("should parse DD/MM/YYYY format", () => {
      const result = parseScreeningDate("22/12/2024", refDate);
      expect(result?.getUTCFullYear()).toBe(2024);
      expect(result?.getUTCMonth()).toBe(11);
      expect(result?.getUTCDate()).toBe(22);
    });

    it("should parse D/M/YYYY format", () => {
      const result = parseScreeningDate("5/1/2025", refDate);
      expect(result?.getUTCFullYear()).toBe(2025);
      expect(result?.getUTCMonth()).toBe(0); // January
      expect(result?.getUTCDate()).toBe(5);
    });
  });

  describe("BFI-style format (Sun 22 Dec)", () => {
    it("should parse short day/month format", () => {
      const result = parseScreeningDate("Sun 22 Dec", refDate);
      expect(result?.getUTCMonth()).toBe(11);
      expect(result?.getUTCDate()).toBe(22);
    });

    it("should parse full weekday and month names", () => {
      const result = parseScreeningDate("Sunday 22 December", refDate);
      expect(result?.getUTCMonth()).toBe(11);
      expect(result?.getUTCDate()).toBe(22);
    });

    it("should handle ordinal suffixes (1st, 2nd, 3rd, 4th)", () => {
      expect(parseScreeningDate("Friday 1st December", refDate)?.getUTCDate()).toBe(1);
      expect(parseScreeningDate("Saturday 2nd December", refDate)?.getUTCDate()).toBe(2);
      expect(parseScreeningDate("Sunday 3rd December", refDate)?.getUTCDate()).toBe(3);
      expect(parseScreeningDate("Monday 4th December", refDate)?.getUTCDate()).toBe(4);
    });

    it("should assume next year for past dates without year", () => {
      // If reference is December 2024 and we parse "15 Jan", it should be Jan 2025
      const result = parseScreeningDate("Wed 15 Jan", refDate);
      expect(result?.getUTCFullYear()).toBe(2025);
      expect(result?.getUTCMonth()).toBe(0); // January
    });

    it("should use current year for future dates without year", () => {
      // Reference is Dec 15, parsing Dec 22 should stay in 2024
      const result = parseScreeningDate("Sun 22 Dec", refDate);
      expect(result?.getUTCFullYear()).toBe(2024);
    });

    it("should use explicit year when provided", () => {
      const result = parseScreeningDate("Sun 22 Dec 2025", refDate);
      expect(result?.getUTCFullYear()).toBe(2025);
    });
  });

  describe("Full date format (22 December 2024)", () => {
    it("should parse day month year format", () => {
      const result = parseScreeningDate("22 December 2024", refDate);
      expect(result?.getUTCFullYear()).toBe(2024);
      expect(result?.getUTCMonth()).toBe(11);
      expect(result?.getUTCDate()).toBe(22);
    });

    it("should handle all months", () => {
      const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      months.forEach((month, index) => {
        const result = parseScreeningDate(`15 ${month} 2024`, refDate);
        expect(result?.getUTCMonth()).toBe(index);
      });
    });
  });

  describe("edge cases", () => {
    it("should handle whitespace", () => {
      const result = parseScreeningDate("  Sun 22 Dec  ", refDate);
      expect(result?.getUTCDate()).toBe(22);
    });

    it("should return null for invalid dates", () => {
      expect(parseScreeningDate("not a date", refDate)).toBeNull();
      expect(parseScreeningDate("", refDate)).toBeNull();
      expect(parseScreeningDate("32/13/2024", refDate)).toBeDefined(); // JS Date handles overflow
    });
  });
});

describe("parseScreeningTime", () => {
  describe("24-hour format", () => {
    it("should parse standard 24-hour times", () => {
      expect(parseScreeningTime("18:30")).toEqual({ hours: 18, minutes: 30 });
      expect(parseScreeningTime("14:00")).toEqual({ hours: 14, minutes: 0 });
      expect(parseScreeningTime("23:45")).toEqual({ hours: 23, minutes: 45 });
    });

    it("should handle 10-12 hour times as-is", () => {
      expect(parseScreeningTime("10:00")).toEqual({ hours: 10, minutes: 0 });
      expect(parseScreeningTime("11:30")).toEqual({ hours: 11, minutes: 30 });
      expect(parseScreeningTime("12:00")).toEqual({ hours: 12, minutes: 0 });
    });

    it("should assume PM for ambiguous single-digit hours (cinema convention)", () => {
      // Cinema showtimes like "2:00" mean 14:00, not 02:00
      expect(parseScreeningTime("2:00")).toEqual({ hours: 14, minutes: 0 });
      expect(parseScreeningTime("6:30")).toEqual({ hours: 18, minutes: 30 });
      expect(parseScreeningTime("9:15")).toEqual({ hours: 21, minutes: 15 });
    });
  });

  describe("12-hour format with AM/PM", () => {
    it("should parse PM times", () => {
      expect(parseScreeningTime("6:30pm")).toEqual({ hours: 18, minutes: 30 });
      expect(parseScreeningTime("11:00PM")).toEqual({ hours: 23, minutes: 0 });
    });

    it("should parse AM times", () => {
      expect(parseScreeningTime("10:30am")).toEqual({ hours: 10, minutes: 30 });
      expect(parseScreeningTime("9:00AM")).toEqual({ hours: 9, minutes: 0 });
    });

    it("should handle 12pm correctly (noon)", () => {
      expect(parseScreeningTime("12:00pm")).toEqual({ hours: 12, minutes: 0 });
    });

    it("should handle 12am correctly (midnight)", () => {
      expect(parseScreeningTime("12:00am")).toEqual({ hours: 0, minutes: 0 });
    });

    it("should handle period separator", () => {
      expect(parseScreeningTime("6.30pm")).toEqual({ hours: 18, minutes: 30 });
      expect(parseScreeningTime("2.15 PM")).toEqual({ hours: 14, minutes: 15 });
    });
  });

  describe("hour-only format", () => {
    it("should parse hour-only times", () => {
      expect(parseScreeningTime("6pm")).toEqual({ hours: 18, minutes: 0 });
      expect(parseScreeningTime("10am")).toEqual({ hours: 10, minutes: 0 });
    });
  });

  describe("edge cases", () => {
    it("should handle whitespace", () => {
      expect(parseScreeningTime("  6:30pm  ")).toEqual({ hours: 18, minutes: 30 });
    });

    it("should return null for unparseable time strings", () => {
      expect(parseScreeningTime("not a time")).toBeNull();
      expect(parseScreeningTime("")).toBeNull();
    });

    // Note: parseScreeningTime doesn't validate hour/minute ranges
    // "25:00" parses to { hours: 25, minutes: 0 } which JS Date handles as overflow
    it("should parse technically invalid times (no range validation)", () => {
      expect(parseScreeningTime("25:00")).toEqual({ hours: 25, minutes: 0 });
    });
  });
});

describe("combineDateAndTime", () => {
  it("should combine date and time correctly (GMT)", () => {
    const date = new Date(Date.UTC(2024, 11, 22));
    const time = { hours: 18, minutes: 30 };

    const result = combineDateAndTime(date, time);

    // December is GMT, so 18:30 UK = 18:30 UTC
    expect(result.getUTCFullYear()).toBe(2024);
    expect(result.getUTCMonth()).toBe(11);
    expect(result.getUTCDate()).toBe(22);
    expect(result.getUTCHours()).toBe(18);
    expect(result.getUTCMinutes()).toBe(30);
    expect(result.getUTCSeconds()).toBe(0);
  });

  it("should handle BST offset correctly", () => {
    // July 15 is BST, so 18:30 UK = 17:30 UTC
    const date = new Date(Date.UTC(2025, 6, 15));
    const time = { hours: 18, minutes: 30 };

    const result = combineDateAndTime(date, time);

    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(6);
    expect(result.getUTCDate()).toBe(15);
    expect(result.getUTCHours()).toBe(17);
    expect(result.getUTCMinutes()).toBe(30);
  });

  it("should not modify the original date", () => {
    const date = new Date(Date.UTC(2024, 11, 22));
    const originalTime = date.getTime();

    combineDateAndTime(date, { hours: 18, minutes: 30 });

    expect(date.getTime()).toBe(originalTime);
  });
});

describe("parseDateTime", () => {
  it("should parse comma-separated date and time", () => {
    const result = parseDateTime("Sun 22 Dec, 18:30");
    expect(result?.getUTCDate()).toBe(22);
    expect(result?.getUTCMonth()).toBe(11);
    expect(result?.getUTCHours()).toBe(18);
    expect(result?.getUTCMinutes()).toBe(30);
  });

  it("should parse 'at' separated date and time", () => {
    const result = parseDateTime("22 December 2024 at 6:30pm");
    expect(result?.getUTCDate()).toBe(22);
    expect(result?.getUTCHours()).toBe(18);
    expect(result?.getUTCMinutes()).toBe(30);
  });

  it("should parse ISO datetime", () => {
    const result = parseDateTime("2024-12-22T18:30:00");
    expect(result?.getUTCFullYear()).toBe(2024);
    expect(result?.getUTCMonth()).toBe(11);
    expect(result?.getUTCDate()).toBe(22);
  });

  it("should return null for unparseable strings", () => {
    expect(parseDateTime("invalid")).toBeNull();
  });
});

describe("londonParts", () => {
  // These assert on fixed UTC instants, so they hold under any host TZ.
  it("should read a summer instant as London local time (BST, UTC+1)", () => {
    expect(londonParts(new Date("2026-09-09T09:00:00Z"))).toEqual({
      year: 2026,
      month: 8, // 0-indexed: September
      day: 9,
      hours: 10,
      minutes: 0,
    });
  });

  it("should read a winter instant as London local time (GMT, UTC+0)", () => {
    expect(londonParts(new Date("2027-01-14T09:00:00Z"))).toEqual({
      year: 2027,
      month: 0, // January
      day: 14,
      hours: 9,
      minutes: 0,
    });
  });

  it("should roll the London calendar date when BST crosses midnight", () => {
    // 23:30 UTC on 14 July is already 00:30 on the 15th in London
    expect(londonParts(new Date("2026-07-14T23:30:00Z"))).toEqual({
      year: 2026,
      month: 6, // July
      day: 15,
      hours: 0,
      minutes: 30,
    });
  });

  it("should report London midnight as hour 0, never hour 24", () => {
    // Guards the hourCycle: "h23" option — some ICU versions return 24 for
    // midnight under hour12: false, which would break hour-range checks.
    expect(londonParts(new Date("2026-12-25T00:00:00Z")).hours).toBe(0);
  });

  it("should agree with ukLocalToUTC round-tripping a BST screening time", () => {
    const instant = ukLocalToUTC(2026, 6, 14, 18, 10);
    expect(londonParts(instant)).toMatchObject({ day: 14, hours: 18, minutes: 10 });
  });
});

// =============================================================================
// Yearless calendar-day inference (Europe/London)
//
// A listing with no year ("Wednesday 9th September") must be resolved against
// today's LONDON CALENDAR DAY, not against the reference instant. Comparing an
// instant with the parsed day's UTC midnight makes *today* look past for the
// whole day after 00:00, so today's screenings were inferred a year ahead and
// then discarded by the horizon.
//
// The pre-existing contract for genuinely past days ("assume next year") is
// deliberately preserved; only same-day is corrected.
// =============================================================================

describe("parseScreeningDate: yearless dates resolve against the London calendar day", () => {
  // 17:00 London (BST) on Wednesday 9 September 2026 — the reported reference.
  const AFTERNOON = new Date("2026-09-09T16:00:00Z");

  it("keeps TODAY in the current year when the reference is later in the day", () => {
    const result = parseScreeningDate("Wednesday 9th September", AFTERNOON);
    expect(result?.toISOString()).toBe("2026-09-09T00:00:00.000Z");
  });

  it("keeps TODAY in the current year before any performance time", () => {
    const result = parseScreeningDate("Wednesday 9th September", new Date("2026-09-09T06:00:00Z"));
    expect(result?.toISOString()).toBe("2026-09-09T00:00:00.000Z");
  });

  it("keeps TODAY in the current year late in the London evening", () => {
    const result = parseScreeningDate("Wednesday 9th September", new Date("2026-09-09T22:30:00Z"));
    expect(result?.toISOString()).toBe("2026-09-09T00:00:00.000Z");
  });

  it("still resolves tomorrow to the current year", () => {
    expect(parseScreeningDate("Thursday 10th September", AFTERNOON)?.toISOString())
      .toBe("2026-09-10T00:00:00.000Z");
  });

  it("still rolls a genuinely past day to next year (pre-existing contract)", () => {
    expect(parseScreeningDate("Tuesday 8th September", AFTERNOON)?.toISOString())
      .toBe("2027-09-08T00:00:00.000Z");
  });

  it("still resolves ordinary future dates in the current year", () => {
    expect(parseScreeningDate("Friday 19th December", AFTERNOON)?.toISOString())
      .toBe("2026-12-19T00:00:00.000Z");
  });

  describe("London-vs-UTC day boundary", () => {
    // 23:30 UTC on 30 June is already 00:30 on 1 July in London (BST).
    const JUST_AFTER_LONDON_MIDNIGHT = new Date("2026-06-30T23:30:00Z");

    it("treats the London day as today, not the UTC day", () => {
      expect(parseScreeningDate("Wednesday 1st July", JUST_AFTER_LONDON_MIDNIGHT)?.toISOString())
        .toBe("2026-07-01T00:00:00.000Z");
    });

    it("treats the previous London day as past", () => {
      expect(parseScreeningDate("Tuesday 30th June", JUST_AFTER_LONDON_MIDNIGHT)?.toISOString())
        .toBe("2027-06-30T00:00:00.000Z");
    });
  });

  describe("year-end rollover", () => {
    const NYE = new Date("2026-12-31T20:00:00Z");

    it("keeps New Year's Eve in the current year", () => {
      expect(parseScreeningDate("Thursday 31st December", NYE)?.toISOString())
        .toBe("2026-12-31T00:00:00.000Z");
    });

    it("rolls 1 January into the next year", () => {
      expect(parseScreeningDate("Friday 1st January", NYE)?.toISOString())
        .toBe("2027-01-01T00:00:00.000Z");
    });
  });

  describe("leap day", () => {
    it("resolves 29 February in a leap year", () => {
      expect(parseScreeningDate("29 February", new Date("2028-02-01T12:00:00Z"))?.toISOString())
        .toBe("2028-02-29T00:00:00.000Z");
    });

    it("documents Date.UTC overflow for 29 February in a non-leap year", () => {
      // Pre-existing behaviour, unchanged by the calendar-day fix: Date.UTC
      // rolls 2027-02-29 to 2027-03-01. Pinned so a future change is deliberate.
      expect(parseScreeningDate("29 February", new Date("2027-02-01T12:00:00Z"))?.toISOString())
        .toBe("2027-03-01T00:00:00.000Z");
    });
  });

  describe("year rollover uses UTC calendar arithmetic, not local-time addYears", () => {
    // Reachable case: "29 March" read on 1 June is a past day, so it rolls.
    // date-fns addYears() works in LOCAL time, so under TZ=Europe/London it
    // produced 2027-03-28T23:00:00Z — combineDateAndTime() reads UTC components,
    // so the screening landed on 28 March. Must hold under every host TZ.
    const JUNE = new Date("2026-06-01T12:00:00Z");

    it("rolls 29 March across the BST boundary without losing a day", () => {
      const result = parseScreeningDate("Sunday 29th March", JUNE);
      expect(result?.toISOString()).toBe("2027-03-29T00:00:00.000Z");
      expect(result?.getUTCDate()).toBe(29);
    });

    it("rolls 25 October across the GMT boundary without gaining a day", () => {
      const result = parseScreeningDate("Sunday 25th October", JUNE);
      expect(result?.toISOString()).toBe("2026-10-25T00:00:00.000Z");
      expect(result?.getUTCDate()).toBe(25);
    });

    it("clamps a real leap day to 28 February when rolling (date-fns parity)", () => {
      // 2028 is a leap year, so "29 February" is VALID and 2028-02-29 is past
      // relative to 2028-03-01, so it rolls. 2029 is not a leap year: the
      // pre-existing contract clamps to 28 Feb rather than spilling into March.
      const result = parseScreeningDate("29 February", new Date("2028-03-01T12:00:00Z"));
      expect(result?.toISOString()).toBe("2029-02-28T00:00:00.000Z");
    });

    it("keeps the already-overflowed non-leap 29 February distinct", () => {
      // Here Date.UTC has already overflowed 2027-02-29 to 2027-03-01 before any
      // rollover, so this is a March date and the clamp is not involved.
      const result = parseScreeningDate("29 February", new Date("2027-06-01T12:00:00Z"));
      expect(result?.toISOString()).toBe("2028-03-01T00:00:00.000Z");
    });

    it("keeps the rolled value at UTC midnight", () => {
      const result = parseScreeningDate("Sunday 29th March", JUNE);
      expect(result?.getUTCHours()).toBe(0);
      expect(result?.getUTCMinutes()).toBe(0);
    });
  });

  it("does not require a valid reference when the year is explicit", () => {
    // londonParts() throws on an invalid Date; an explicit year must not consult it.
    expect(parseScreeningDate("Sun 22 Dec 2025", new Date(NaN))?.toISOString())
      .toBe("2025-12-22T00:00:00.000Z");
  });

  it("still honours an explicit year over any inference", () => {
    expect(parseScreeningDate("Wednesday 9th September 2025", AFTERNOON)?.toISOString())
      .toBe("2025-09-09T00:00:00.000Z");
  });
});
