/**
 * BFI IMAX morning screenings: the real mapRows → validateScreenings seam.
 *
 * WHY. The 2026-09-09 run found 91 IMAX rows and rejected 12, every one of them
 * "The Odyssey" at hour 9, as `suspicious_time_early` (scrape-full-20260909-221554.log
 * :6845-6857, "Total: 91 | Valid: 79 | Rejected: 12").
 *
 * THE SOURCE FORMAT IS ESTABLISHED, not assumed. A bounded read-only capture on
 * 2026-09-10 (see __fixtures__/bfi/PROVENANCE.json) shows the clock column
 * row[8] is a ZERO-PADDED 24-HOUR field: hours 13,14,15,17,18,19,20,21,22 and
 * 23 all occur across the 91 rows, values below ten are written "09:00" and
 * never "9:00", and no am/pm text appears anywhere in the column. Column [7]
 * corroborates ("Saturday 12 September 2026 09:00"). A 12-hour clock cannot
 * emit "23:00", so "09:00" here is unambiguously 09:00 local.
 *
 * SCOPE LIMIT. That capture fixes the source's FORMAT, a stable property of the
 * feed. It does NOT establish the contents of the 2026-09-09 run, so nothing
 * here proves which 12 records were rejected that day.
 *
 * POLICY BOUNDARY these tests pin. `timeSource: "iso"` currently does two
 * unrelated jobs: keep sub-10:00 times, and raise the horizon 90 → 180 days.
 * BFI's clock is a local structured 24-hour string, NOT an ISO instant, so
 * labelling it "iso" would silently extend BFI's horizon to 180 days. The
 * distinction under test keeps the early-hour trust and leaves the horizon at 90.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createBFIScraper, isUnambiguous24hClock } from "./bfi";
import { validateScreenings } from "../utils/screening-validator";
import { ukLocalToUTC } from "../utils/date-parser";
import type { RawScreening } from "../types";

type SearchRow = unknown[];
const ROWS: SearchRow[] = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "bfi", "imax-searchrows.json"), "utf8"),
);

/** Drive the production private mapper; never a reimplementation of it. */
function mapRows(rows: SearchRow[], venue: "bfi-imax" | "bfi-southbank" = "bfi-imax"): RawScreening[] {
  const scraper = createBFIScraper(venue);
  return (scraper as unknown as { mapRows(r: SearchRow[]): RawScreening[] }).mapRows(rows);
}

beforeEach(() => {
  vi.useFakeTimers();
  // Before the fixture's earliest row (2026-09-10 09:45 London) so none is "past".
  vi.setSystemTime(new Date("2026-09-10T00:00:00.000Z"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("BFI IMAX parse → validation seam", () => {
  it("maps the captured rows, including the 09:xx ones", () => {
    const out = mapRows(ROWS);
    expect(out.length).toBeGreaterThan(0);
    const early = out.filter((s) => s.datetime.toISOString().slice(11, 13) === "08");
    // 09:00 London in BST is 08:00Z.
    expect(early.length).toBeGreaterThan(0);
  });

  it("marks the structured 24-hour clock as a local-24h time source", () => {
    const out = mapRows(ROWS);
    expect(out.every((s) => s.timeSource === "local-24h")).toBe(true);
    // Must NOT claim ISO: these are local wall clocks, not instants.
    expect(out.some((s) => s.timeSource === "iso")).toBe(false);
  });

  it("KEEPS the 09:xx screenings instead of rejecting them as suspiciously early", () => {
    const { validScreenings, rejectedScreenings } = validateScreenings(mapRows(ROWS));
    const rejectedEarly = rejectedScreenings.filter((r) =>
      JSON.stringify(r).includes("suspicious_time_early"),
    );
    expect(rejectedEarly).toHaveLength(0);
    const nineAm = validScreenings.filter((s) => s.datetime.toISOString().slice(11, 16) === "08:00");
    expect(nineAm.length).toBeGreaterThan(0);
  });

  it("still surfaces the early times as warnings, so they stay visible", () => {
    const { summary } = validateScreenings(mapRows(ROWS));
    expect(summary.warningsByType).toBeDefined();
    const keys = Object.keys(summary.warningsByType).join(" ");
    expect(keys).toContain("suspicious_time_early");
  });
});

describe("the policy boundary: early-hour trust must not extend the date horizon", () => {
  const base = (over: Partial<RawScreening>): RawScreening => ({
    filmTitle: "Horizon Probe",
    datetime: new Date(Date.now() + 120 * 86_400_000),
    bookingUrl: "https://whatson.bfi.org.uk/imax/Online",
    sourceId: "probe",
    ...over,
  });

  it("rejects a 120-day-out local-24h screening — BFI's horizon stays 90", () => {
    const { rejectedScreenings } = validateScreenings([base({ timeSource: "local-24h" })]);
    expect(JSON.stringify(rejectedScreenings)).toContain("too_far_future");
  });

  it("still accepts a 120-day-out iso screening — existing ISO policy unchanged", () => {
    const { validScreenings } = validateScreenings([base({ timeSource: "iso" })]);
    expect(validScreenings).toHaveLength(1);
  });

  it("still rejects a 120-day-out text screening", () => {
    const { rejectedScreenings } = validateScreenings([base({ timeSource: "text" })]);
    expect(JSON.stringify(rejectedScreenings)).toContain("too_far_future");
  });
});

describe("ambiguous text clocks stay protected", () => {
  const early = (over: Partial<RawScreening>): RawScreening => {
    // 09:00 LONDON, built explicitly. `setHours(9)` would be host-local, so
    // under TZ=UTC in BST it yields 09:00Z = 10:00 London — not early at all,
    // and the test would pass for the wrong reason on one host and fail on
    // another. The validator judges the London hour, so the fixture must too.
    const ref = new Date(Date.now() + 3 * 86_400_000);
    const d = ukLocalToUTC(
      ref.getUTCFullYear(),
      ref.getUTCMonth(),
      ref.getUTCDate(),
      9,
      0,
    );
    return {
      filmTitle: "Ambiguous Nine",
      datetime: d,
      bookingUrl: "https://example.test",
      sourceId: "amb",
      ...over,
    };
  };

  it("still rejects a 09:00 text-sourced screening (1-9 PM ambiguity unresolved)", () => {
    const { rejectedScreenings } = validateScreenings([early({ timeSource: "text" })]);
    expect(JSON.stringify(rejectedScreenings)).toContain("suspicious_time_early");
  });

  it("still rejects a 09:00 screening with no timeSource at all", () => {
    const { rejectedScreenings } = validateScreenings([early({})]);
    expect(JSON.stringify(rejectedScreenings)).toContain("suspicious_time_early");
  });
});

describe("BFI clock handling across DST and malformed input", () => {
  function rowWith(clock: string, day: number, month0: number, year: number): SearchRow {
    const r = JSON.parse(JSON.stringify(ROWS[0])) as unknown[];
    r[8] = clock; r[9] = day; r[10] = month0; r[11] = year;
    r[7] = `Probe ${day}/${month0 + 1}/${year} ${clock}`;
    return r;
  }

  it("reads a BST 09:00 as 08:00Z", () => {
    const [s] = mapRows([rowWith("09:00", 12, 8, 2026)]); // 12 Sep 2026, BST
    expect(s.datetime.toISOString()).toBe("2026-09-12T08:00:00.000Z");
  });

  it("reads a GMT 09:00 as 09:00Z", () => {
    vi.setSystemTime(new Date("2026-11-01T00:00:00.000Z"));
    const [s] = mapRows([rowWith("09:00", 10, 11, 2026)]); // 10 Dec 2026, GMT
    expect(s.datetime.toISOString()).toBe("2026-12-10T09:00:00.000Z");
  });

  it("does not claim local-24h provenance when the clock field is malformed", () => {
    // Falls through to the display-text fallback, which is text parsing.
    const out = mapRows([rowWith("not-a-clock", 12, 8, 2026)]);
    for (const s of out) expect(s.timeSource).not.toBe("local-24h");
  });

  it("skips a row whose date parts are missing and whose text is unparseable", () => {
    const r = JSON.parse(JSON.stringify(ROWS[0])) as unknown[];
    r[8] = ""; r[9] = null; r[10] = null; r[11] = null; r[7] = "";
    expect(mapRows([r])).toHaveLength(0);
  });
});


describe("provenance is awarded only on a strictly validated clock", () => {
  // The parse regex /^(\d{1,2}):(\d{2})/ is unanchored and range-free, so it
  // also matches "09:00 PM" (really 21:00) and "29:99". Awarding local-24h on
  // that prefix match would trust exactly the AM/PM error the early-time guard
  // exists to catch. These pin the stricter provenance gate.
  it.each([
    ["09:00 PM", "meridiem suffix — really 21:00"],
    ["09:00pm", "no-space meridiem"],
    ["9:00", "not zero-padded"],
    ["29:99", "impossible clock"],
    ["24:00", "hour out of range"],
    ["09:60", "minute out of range"],
    ["09:00:00", "seconds suffix"],
    ["09:00 (doors 08:30)", "trailing prose"],
    ["", "empty"],
  ])("refuses local-24h for %s (%s)", (clock) => {
    expect(isUnambiguous24hClock(clock)).toBe(false);
  });

  it.each([["00:00"], ["09:00"], ["09:45"], ["13:15"], ["23:59"]])(
    "accepts the complete in-range clock %s",
    (clock) => {
      expect(isUnambiguous24hClock(clock)).toBe(true);
    },
  );

  it("through production mapRows: a meridiem-suffixed clock earns no provenance and is still rejected", () => {
    const r = JSON.parse(JSON.stringify(ROWS[0])) as unknown[];
    r[8] = "09:00 PM"; r[9] = 12; r[10] = 8; r[11] = 2026;
    r[7] = "Saturday 12 September 2026 09:00 PM";
    const out = mapRows([r]);
    expect(out).toHaveLength(1);
    expect(out[0].timeSource).toBeUndefined();
    // The parse is unchanged, so it still reads 09:00 — and because provenance
    // was withheld, the validator still rejects it rather than trusting it.
    const { rejectedScreenings } = validateScreenings(out);
    expect(JSON.stringify(rejectedScreenings)).toContain("suspicious_time_early");
  });

  it("through production mapRows: an impossible clock earns no provenance", () => {
    const r = JSON.parse(JSON.stringify(ROWS[0])) as unknown[];
    r[8] = "29:99"; r[9] = 12; r[10] = 8; r[11] = 2026;
    const out = mapRows([r]);
    for (const s of out) expect(s.timeSource).toBeUndefined();
  });
});

describe("provenance is scoped to the venue whose format was captured", () => {
  it("BFI Southbank earns no local-24h — its clock format is unverified", () => {
    // Two bounded capture attempts on 2026-09-10 hit Cloudflare (HTTP 403,
    // "Just a moment...", no searchResults). Southbank keeps full strictness.
    const r = JSON.parse(JSON.stringify(ROWS[0])) as unknown[];
    r[2] = "BFI Southbank"; r[8] = "09:00"; r[9] = 12; r[10] = 8; r[11] = 2026;
    const out = mapRows([r], "bfi-southbank");
    expect(out).toHaveLength(1);
    expect(out[0].timeSource).toBeUndefined();
    const { rejectedScreenings } = validateScreenings(out);
    expect(JSON.stringify(rejectedScreenings)).toContain("suspicious_time_early");
  });

  it("the same row at IMAX does earn local-24h and survives", () => {
    const r = JSON.parse(JSON.stringify(ROWS[0])) as unknown[];
    r[8] = "09:00"; r[9] = 12; r[10] = 8; r[11] = 2026;
    const out = mapRows([r], "bfi-imax");
    expect(out[0].timeSource).toBe("local-24h");
    expect(validateScreenings(out).validScreenings).toHaveLength(1);
  });
});
