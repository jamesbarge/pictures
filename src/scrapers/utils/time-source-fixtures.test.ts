import { describe, expect, it } from "vitest";
import { load } from "cheerio";
import fixtures from "./fixtures/time-source-2026-09-08.json";
import { londonParts, parseScreeningTime } from "./date-parser";

describe("captured source text: unchanged parser-policy characterization", () => {
  it.each(fixtures.cases)("$venue: $parserInput", (example) => {
    const text = load(example.excerpt).root().text().trim().replace(/\s+/g, " ");
    const input = example.venue === "bertha-dochouse"
      ? text.match(/\d{1,2}:\d{2}/)?.[0]
      : text;
    expect(input).toBe(example.parserInput);
    expect(parseScreeningTime(input!)).toEqual(example.currentPolicyResult);
  });

  it("keeps the closed-booking context on the unresolved morning example", () => {
    const example = fixtures.cases.find((row) => row.parserInput === "08:00")!;
    expect(example.context).toContain("Closed for Booking");
    // Known legacy interpretation, deliberately NOT a correctness claim.
    expect(example.currentPolicyResult.hours).toBe(20);
  });
});

describe("London clock at the 2026 DST boundaries", () => {
  it.each([
    ["2026-03-29T00:30:00Z", 0],
    ["2026-03-29T01:30:00Z", 2],
    ["2026-10-25T00:30:00Z", 1],
    ["2026-10-25T01:30:00Z", 1],
  ])("%s reads hour %s in London", (instant, hours) => {
    expect(londonParts(new Date(instant))).toMatchObject({ hours, minutes: 30 });
  });
});
