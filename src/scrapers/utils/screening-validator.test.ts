import { describe, it, expect } from "vitest";
import {
  sanitizeScreening,
  validateScreenings,
} from "./screening-validator";
import type { RawScreening } from "../types";

function makeScreening(overrides: Partial<RawScreening> = {}): RawScreening {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0); // 2 PM — always within valid screening hours
  return {
    filmTitle: "Test Film",
    datetime: tomorrow,
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

/** A screening N days out at the given local hour. */
function makeFutureScreening(daysOut: number, hour: number, overrides: Partial<RawScreening> = {}): RawScreening {
  const datetime = new Date();
  datetime.setDate(datetime.getDate() + daysOut);
  datetime.setHours(hour, 0, 0, 0);
  return makeScreening({ datetime, ...overrides });
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
