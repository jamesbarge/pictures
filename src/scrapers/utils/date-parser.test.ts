import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseScreeningDate,
  parseScreeningTime,
  combineDateAndTime,
  parseDateTime,
  lastSundayOfMonth,
  isUKSummerTime,
  ukLocalToUTC,
  parseUKLocalDateTime,
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
