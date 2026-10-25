import { describe, expect, it } from "vitest";

import {
  gardenPerformanceId,
  parseGardenBookingHeading,
  resolveSharedGardenPerformance,
  screeningMatchesGardenHeading,
} from "./garden-performance";

/** Markup from the live Savoy page for TcsPerformance_6266328 on 24 Oct 2026. */
const SOCIAL_RECKONING_6266328 = `
<div id="Detail" class="PerformanceList"><div class="programme twelvecol">
  <h1 class="title">The Social Reckoning (15)</h1>
  <p class="perf-time">Tuesday 27 Oct 2026, 3:45pm</p>
</div></div>`;

const socialUrl =
  "https://bookings.thegardencinema.co.uk/TheGardenCinema.dll/TSelectItems.waSelectItemsPrompt.TcsWebMenuItem_0.TcsWebTab_0.TcsPerformance_6266328.TcsSection_971";
const fatherlandUrl =
  "https://bookings.thegardencinema.co.uk/TheGardenCinema.dll/TSelectItems.waSelectItemsPrompt.TcsWebMenuItem_0.TcsWebTab_0.TcsPerformance_6266332.TcsSection_638";

describe("Garden performance 6266328", () => {
  it("parses the live booking heading", () => {
    expect(parseGardenBookingHeading(SOCIAL_RECKONING_6266328)).toEqual({
      title: "The Social Reckoning",
      date: "2026-10-27",
      time: "15:45",
    });
    expect(gardenPerformanceId(socialUrl)).toBe("6266328");
  });

  it("keeps The Social Reckoning at 15:45Z and drops the Fatherland 16:00 row that shares the URL", () => {
    const heading = parseGardenBookingHeading(SOCIAL_RECKONING_6266328);
    const social = {
      filmTitle: "The Social Reckoning",
      datetime: new Date("2026-10-27T15:45:00.000Z"),
      bookingUrl: socialUrl,
    };
    const phantom = {
      filmTitle: "Fatherland",
      datetime: new Date("2026-10-27T16:00:00.000Z"),
      bookingUrl: socialUrl,
    };

    expect(screeningMatchesGardenHeading(social, heading!)).toBe(true);
    expect(screeningMatchesGardenHeading(phantom, heading!)).toBe(false);

    const plan = resolveSharedGardenPerformance([social, phantom], heading);
    expect(plan.keep).toEqual([social]);
    expect(plan.drop).toEqual([phantom]);
  });

  it("leaves a Fatherland showing on its own performance id alone", () => {
    const fatherland = {
      filmTitle: "Fatherland",
      datetime: new Date("2026-10-27T15:30:00.000Z"),
      bookingUrl: fatherlandUrl,
    };
    const plan = resolveSharedGardenPerformance(
      [fatherland],
      parseGardenBookingHeading(SOCIAL_RECKONING_6266328),
    );
    expect(plan.drop).toEqual([]);
    expect(plan.keep).toEqual([fatherland]);
  });

  it("drops nothing when the booking page cannot be read", () => {
    const rows = [
      { filmTitle: "The Social Reckoning", datetime: new Date("2026-10-27T15:45:00.000Z") },
      { filmTitle: "Fatherland", datetime: new Date("2026-10-27T16:00:00.000Z") },
    ];
    expect(resolveSharedGardenPerformance(rows, null).drop).toEqual([]);
  });

  it("matches a BST wall clock, not the UTC hour", () => {
    // 24 Oct 2026 is still BST. 3:45pm London is 14:45Z.
    const heading = parseGardenBookingHeading(`
      <h1 class="title">The Social Reckoning (15)</h1>
      <p class="perf-time">Saturday 24 Oct 2026, 3:45pm</p>`);
    expect(
      screeningMatchesGardenHeading(
        { filmTitle: "The Social Reckoning", datetime: new Date("2026-10-24T14:45:00.000Z") },
        heading!,
      ),
    ).toBe(true);
    expect(
      screeningMatchesGardenHeading(
        { filmTitle: "The Social Reckoning", datetime: new Date("2026-10-24T15:45:00.000Z") },
        heading!,
      ),
    ).toBe(false);
  });
});
