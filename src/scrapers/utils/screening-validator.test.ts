import { afterEach, describe, it, expect, vi } from "vitest";
import {
  sanitizeScreening,
  validateScreenings,
} from "./screening-validator";
import { londonParts, ukLocalToUTC } from "./date-parser";
import type { RawScreening } from "../types";

/**
 * The London calendar date N days from now.
 *
 * Fixtures below express screening times as London local hours, because that is
 * what the validator's opening-hours policy is written in. Building them with
 * setHours() would express them in the host timezone instead, which is how the
 * pre-fix suite managed to agree with a host-local getHours() under every TZ
 * and so could never catch a timezone bug.
 */
function londonDayOffset(daysOut: number): { year: number; month: number; day: number } {
  const { year, month, day } = londonParts(new Date());
  // Date.UTC normalises month/day overflow for large offsets (e.g. 200 days).
  const rolled = new Date(Date.UTC(year, month, day + daysOut));
  return {
    year: rolled.getUTCFullYear(),
    month: rolled.getUTCMonth(),
    day: rolled.getUTCDate(),
  };
}

function makeScreening(overrides: Partial<RawScreening> = {}): RawScreening {
  const { year, month, day } = londonDayOffset(1);
  return {
    filmTitle: "Test Film",
    // Tomorrow, 14:00 London — always within valid screening hours
    datetime: ukLocalToUTC(year, month, day, 14, 0),
    bookingUrl: "https://example.com/book",
    ...overrides,
  };
}

describe("sanitizeScreening", () => {
  it("should strip HTML tags from film titles", () => {
    const screening = makeScreening({
      filmTitle: "<b>Bold</b> Title",
    });
    const result = sanitizeScreening(screening);
    expect(result.filmTitle).toBe("Bold Title");
  });

  it("should strip script tags from film titles", () => {
    const screening = makeScreening({
      filmTitle: 'Film <script>alert("xss")</script>',
    });
    const result = sanitizeScreening(screening);
    expect(result.filmTitle).toBe('Film alert("xss")');
  });

  it("should handle titles with no HTML", () => {
    const screening = makeScreening({ filmTitle: "Normal Title" });
    const result = sanitizeScreening(screening);
    expect(result.filmTitle).toBe("Normal Title");
  });

  it("should trim whitespace after stripping tags", () => {
    const screening = makeScreening({
      filmTitle: "  <em>Italic</em>  ",
    });
    const result = sanitizeScreening(screening);
    expect(result.filmTitle).toBe("Italic");
  });

  it("should preserve other screening fields", () => {
    const screening = makeScreening({
      filmTitle: "<b>Film</b>",
      format: "35mm",
      screen: "Screen 1",
    });
    const result = sanitizeScreening(screening);
    expect(result.format).toBe("35mm");
    expect(result.screen).toBe("Screen 1");
  });

  it("should strip HTML from all text fields", () => {
    const screening = makeScreening({
      filmTitle: "<b>Test</b> Film",
      eventDescription: "<p>A special <em>screening</em></p>",
      screen: "Screen <br/>1",
      format: "<span>35mm</span>",
      director: "<a href='x'>Christopher Nolan</a>",
    });
    const sanitized = sanitizeScreening(screening);
    expect(sanitized.filmTitle).toBe("Test Film");
    expect(sanitized.eventDescription).toBe("A special screening");
    expect(sanitized.screen).toBe("Screen 1");
    expect(sanitized.format).toBe("35mm");
    expect(sanitized.director).toBe("Christopher Nolan");
  });

  it("should not add undefined fields when optional fields are missing", () => {
    const screening = makeScreening({
      filmTitle: "<b>Film</b>",
    });
    const sanitized = sanitizeScreening(screening);
    expect(sanitized.filmTitle).toBe("Film");
    expect(sanitized.eventDescription).toBeUndefined();
    expect(sanitized.screen).toBeUndefined();
    expect(sanitized.format).toBeUndefined();
    expect(sanitized.director).toBeUndefined();
  });
});

describe("validateScreenings sanitization", () => {
  it("should sanitize valid screenings in the pipeline", () => {
    const screenings = [
      makeScreening({ filmTitle: "<b>Bold Film</b>" }),
      makeScreening({ filmTitle: "Clean Title" }),
    ];
    const { validScreenings } = validateScreenings(screenings);
    expect(validScreenings).toHaveLength(2);
    expect(validScreenings[0].filmTitle).toBe("Bold Film");
    expect(validScreenings[1].filmTitle).toBe("Clean Title");
  });
});

// =============================================================================
// Time-provenance awareness (plan 010, step 3)
//
// The early-time and future-cap heuristics exist to catch *text-parsing*
// errors (missed AM/PM, wrong year). ISO/API timestamps can't have those, so
// screenings flagged timeSource: "iso" get warn-not-reject at 09:00 (Everyman
// kids/early shows) and a 180-day future cap (Met Opera 2026-27 at the chains)
// instead of 90.
// =============================================================================

/** A screening N days out at the given London local hour. */
function makeFutureScreening(daysOut: number, hour: number, overrides: Partial<RawScreening> = {}): RawScreening {
  const { year, month, day } = londonDayOffset(daysOut);
  return makeScreening({ datetime: ukLocalToUTC(year, month, day, hour, 0), ...overrides });
}

describe("time-provenance: suspicious_time_early", () => {
  it("keeps a 09:00 ISO-sourced screening, with a warning", () => {
    const screening = makeFutureScreening(1, 9, { timeSource: "iso" });
    const { validScreenings, rejectedScreenings, summary } = validateScreenings([screening]);
    expect(validScreenings).toHaveLength(1);
    expect(rejectedScreenings).toHaveLength(0);
    expect(summary.warningsByType["suspicious_time_early"]).toBe(1);
  });

  it("still rejects a 09:00 text-parsed screening (explicit text)", () => {
    const screening = makeFutureScreening(1, 9, { timeSource: "text" });
    const { validScreenings, rejectedScreenings, summary } = validateScreenings([screening]);
    expect(validScreenings).toHaveLength(0);
    expect(rejectedScreenings).toHaveLength(1);
    expect(summary.errorsByType["suspicious_time_early"]).toBe(1);
  });

  it("still rejects a 09:00 screening with no timeSource (treated as text)", () => {
    const screening = makeFutureScreening(1, 9);
    const { rejectedScreenings } = validateScreenings([screening]);
    expect(rejectedScreenings).toHaveLength(1);
    expect(rejectedScreenings[0].errors[0]).toContain("suspicious_time_early");
  });
});

describe("time-provenance: too_far_future", () => {
  it("keeps a 120-day-out ISO-sourced screening (180-day cap)", () => {
    const screening = makeFutureScreening(120, 14, { timeSource: "iso" });
    const { validScreenings, rejectedScreenings } = validateScreenings([screening]);
    expect(validScreenings).toHaveLength(1);
    expect(rejectedScreenings).toHaveLength(0);
  });

  it("rejects a 120-day-out text-parsed screening (90-day cap)", () => {
    const screening = makeFutureScreening(120, 14, { timeSource: "text" });
    const { rejectedScreenings, summary } = validateScreenings([screening]);
    expect(rejectedScreenings).toHaveLength(1);
    expect(summary.errorsByType["too_far_future"]).toBe(1);
  });

  it("rejects a 120-day-out screening with no timeSource (treated as text)", () => {
    const screening = makeFutureScreening(120, 14);
    const { rejectedScreenings } = validateScreenings([screening]);
    expect(rejectedScreenings).toHaveLength(1);
    expect(rejectedScreenings[0].errors[0]).toContain("max 90");
  });

  it("rejects an ISO-sourced screening beyond 180 days — the cap still guards parse-year errors", () => {
    const screening = makeFutureScreening(200, 14, { timeSource: "iso" });
    const { rejectedScreenings } = validateScreenings([screening]);
    expect(rejectedScreenings).toHaveLength(1);
    expect(rejectedScreenings[0].errors[0]).toContain("max 180");
  });
});

// =============================================================================
// Timezone independence
//
// Cinema opening hours are a London-local policy, so the verdict on a given
// instant must be the same whether the process runs under TZ=UTC (CI, cron,
// Vercel) or TZ=Europe/London (dev machines). Each case pins the clock so the
// fixed instants stay clear of the past_screening and too_far_future caps.
//
// Which cases actually guard the bug: only the two BST cases. In winter London
// is UTC, so the GMT and Christmas Day cases agree with a host-local read under
// both TZ=UTC and TZ=Europe/London, and can only fail on a host west of UTC.
// December makes a London-versus-UTC discriminator impossible by construction,
// so treat those two as policy pins and the BST pair as the regression guard.
// =============================================================================

describe("timezone independence: London-local screening hours", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function pinClock(now: string): void {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
  }

  describe("summer (BST, London is UTC+1)", () => {
    it("accepts 09:00 UTC, which is 10:00 in London", () => {
      pinClock("2026-09-08T12:00:00Z");
      const screening = makeScreening({
        datetime: new Date("2026-09-09T09:00:00Z"),
        timeSource: "text",
      });

      const { validScreenings, rejectedScreenings } = validateScreenings([screening]);

      expect(rejectedScreenings).toHaveLength(0);
      expect(validScreenings).toHaveLength(1);
    });

    it("rejects 08:30 UTC, which is 09:30 in London", () => {
      pinClock("2026-09-08T12:00:00Z");
      const screening = makeScreening({
        datetime: new Date("2026-09-09T08:30:00Z"),
        timeSource: "text",
      });

      const { rejectedScreenings, summary } = validateScreenings([screening]);

      expect(rejectedScreenings).toHaveLength(1);
      expect(summary.errorsByType["suspicious_time_early"]).toBe(1);
    });
  });

  describe("winter (GMT, London is UTC+0)", () => {
    it("rejects 09:00 UTC, which is also 09:00 in London", () => {
      pinClock("2027-01-13T12:00:00Z");
      const screening = makeScreening({
        datetime: new Date("2027-01-14T09:00:00Z"),
        timeSource: "text",
      });

      const { rejectedScreenings, summary } = validateScreenings([screening]);

      expect(rejectedScreenings).toHaveLength(1);
      expect(summary.errorsByType["suspicious_time_early"]).toBe(1);
    });

    it("accepts 10:00 UTC, which is 10:00 in London", () => {
      pinClock("2027-01-13T12:00:00Z");
      const screening = makeScreening({
        datetime: new Date("2027-01-14T10:00:00Z"),
        timeSource: "text",
      });

      const { validScreenings, rejectedScreenings } = validateScreenings([screening]);

      expect(rejectedScreenings).toHaveLength(0);
      expect(validScreenings).toHaveLength(1);
    });
  });

  it("reports the London hour in the rejection message, not the host hour", () => {
    pinClock("2026-09-08T12:00:00Z");
    const screening = makeScreening({
      datetime: new Date("2026-09-09T08:30:00Z"), // 09:30 London
      timeSource: "text",
    });

    const { rejectedScreenings } = validateScreenings([screening]);

    expect(rejectedScreenings[0].errors[0]).toContain("Screening at 9:00");
  });

  it("uses the London calendar date for the Christmas Day warning", () => {
    pinClock("2026-12-24T12:00:00Z");
    // 00:30 UTC on the 25th is 00:30 on the 25th in London (GMT)
    const screening = makeScreening({
      datetime: new Date("2026-12-25T00:30:00Z"),
      timeSource: "iso",
    });

    const { summary } = validateScreenings([screening]);

    expect(summary.warningsByType["holiday_screening"]).toBe(1);
  });
});
