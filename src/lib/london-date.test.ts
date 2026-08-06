import { describe, expect, it } from "vitest";

import { addDaysToDateString, daysBetweenDateStrings, londonDateString } from "./london-date";

/**
 * These helpers underpin THE SLEEPER's date keys. If they disagree with the
 * frontend's equivalents in frontend/src/lib/london-date.ts, the homepage
 * lookup `data.sleepers[date]` silently never matches and the feature becomes
 * an invisible no-op that no other test would catch.
 */
describe("londonDateString", () => {
  it("keeps a late-evening BST instant on the same London day", () => {
    // 23:30 London on 6 Aug (BST, UTC+1) is 22:30Z. Naive UTC formatting gives
    // the right answer here, but see the next case.
    expect(londonDateString(new Date("2026-08-06T22:30:00.000Z"))).toBe("2026-08-06");
  });

  it("rolls to the next London day before UTC does, under BST", () => {
    // 23:30Z is already 00:30 on the 7th in London. Formatting in UTC would
    // wrongly report the 6th.
    expect(londonDateString(new Date("2026-08-06T23:30:00.000Z"))).toBe("2026-08-07");
  });

  it("agrees with UTC in winter, when London is GMT", () => {
    expect(londonDateString(new Date("2026-01-15T23:30:00.000Z"))).toBe("2026-01-15");
  });

  it("handles the spring-forward boundary", () => {
    // BST begins 01:00Z on 29 March 2026.
    expect(londonDateString(new Date("2026-03-29T00:30:00.000Z"))).toBe("2026-03-29");
    expect(londonDateString(new Date("2026-03-29T01:30:00.000Z"))).toBe("2026-03-29");
  });
});

describe("addDaysToDateString", () => {
  it.each([
    ["forward within a month", "2026-08-06", 1, "2026-08-07"],
    ["across a month boundary", "2026-08-31", 1, "2026-09-01"],
    ["the full 21-day horizon", "2026-08-06", 21, "2026-08-27"],
    ["backwards one cooldown window", "2026-08-06", -21, "2026-07-16"],
    ["zero is identity", "2026-08-06", 0, "2026-08-06"],
    ["across a leap day", "2028-02-28", 1, "2028-02-29"],
  ])("%s", (_label, from, days, expected) => {
    expect(addDaysToDateString(from, days)).toBe(expected);
  });

  it("does not slip a day across the DST transition", () => {
    // Anchoring at 12:00Z is what protects this: a midnight anchor plus a
    // spring-forward hour would land on the previous date.
    expect(addDaysToDateString("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDaysToDateString("2026-10-24", 1)).toBe("2026-10-25");
  });
});

describe("daysBetweenDateStrings", () => {
  it.each([
    ["same day", "2026-08-06", "2026-08-06", 0],
    ["one day", "2026-08-06", "2026-08-07", 1],
    ["exactly the cooldown window", "2026-07-16", "2026-08-06", 21],
    ["negative when reversed", "2026-08-07", "2026-08-06", -1],
    ["across the DST transition", "2026-03-28", "2026-03-30", 2],
  ])("%s", (_label, from, to, expected) => {
    expect(daysBetweenDateStrings(from, to)).toBe(expected);
  });
});
