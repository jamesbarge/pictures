import { describe, expect, it } from "vitest";

import {
  collapseGardenTranslationDuplicates,
  gardenEnglishTitle,
  gardenListingTitle,
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

/** Live Savoy heading for TcsPerformance_6223527 on 27 Oct 2026. */
const FLAMENCO_6223527 = `
<div id="Detail" class="PerformanceList"><div class="programme twelvecol">
  <h1 class="title">In-Edit Cine-Documental: La guitarra flamenca de Yerai Cortés (The Flamenco Guitar of Yerai Cortés) (PG)</h1>
  <p class="perf-time">Tuesday 10 Nov 2026, 6:10pm</p>
</div></div>`;

const BILINGUAL = "La guitarra flamenca de Yerai Cortés (The Flamenco Guitar of Yerai Cortés)";
const ENGLISH = "The Flamenco Guitar of Yerai Cortés";
const flamencoUrl =
  "https://bookings.thegardencinema.co.uk/TheGardenCinema.dll/TSelectItems.waSelectItemsPrompt.TcsWebMenuItem_0.TcsWebTab_0.TcsPerformance_6223527.TcsSection_971";

describe("Garden Original (English title)", () => {
  it("reads the English title out of the live bilingual listing", () => {
    expect(gardenEnglishTitle(BILINGUAL)).toBe(ENGLISH);
    expect(gardenListingTitle(BILINGUAL)).toBe(ENGLISH);
    expect(gardenListingTitle(ENGLISH)).toBe(ENGLISH);
  });

  it("reads Song of the Hands, including a trailing year", () => {
    expect(gardenEnglishTitle("El canto de las manos (Song of the Hands)")).toBe("Song of the Hands");
    expect(gardenEnglishTitle("El canto de las manos (Song of the Hands) (2025)")).toBe(
      "Song of the Hands",
    );
  });

  it("leaves titles that only look similar", () => {
    const unchanged = [
      "What's Up, Doc?",
      "Shaun the Sheep: The Beast of Mossy Bottom",
      "Köln Tracks: The Legend of Keith Jarrett's Köln Concert",
      "Before It Was Cool: The Brooklyn Beat from Lauterbach's",
      "Spider (2002) with Peter Suschitzky",
      "Cosmopolis (2012) with Ben Rivers",
      "Don DeLillo at 90: Cosmopolis with Ben Rivers",
      "Patience (After Sebald) with Director Grant Gee",
      "The Social Reckoning",
      "Fatherland",
      "Die Hard (With a Vengeance)",
      "La La Land (Singin' in the Rain)",
      "Nosferatu (A Symphony of Horror)",
      "The Godfather (Part II)",
      "Cyrano de Bergerac (1990)",
      "Nine Queens (Nueve reinas)",
    ];
    for (const title of unchanged) {
      expect(gardenEnglishTitle(title), title).toBeNull();
      expect(gardenListingTitle(title), title).toBe(title);
    }
  });

  it("parses the live booking heading down to the English title", () => {
    expect(parseGardenBookingHeading(FLAMENCO_6223527)).toEqual({
      title: "In-Edit Cine-Documental: La guitarra flamenca de Yerai Cortés (The Flamenco Guitar of Yerai Cortés)",
      date: "2026-11-10",
      time: "18:10",
    });
    expect(gardenPerformanceId(flamencoUrl)).toBe("6223527");
  });

  it("keeps the TMDB title and drops the bilingual row that shares performance 6223527", () => {
    // 10 Nov 2026 is GMT. 6:10pm London is 18:10Z. Exact loose equality with
    // the heading matches neither stored title: the heading has the
    // "In-Edit Cine-Documental:" strand, so PR #840's guard kept both.
    const heading = parseGardenBookingHeading(FLAMENCO_6223527);
    const bilingual = {
      filmTitle: BILINGUAL,
      datetime: new Date("2026-11-10T18:10:00.000Z"),
      bookingUrl: flamencoUrl,
    };
    const english = {
      filmTitle: ENGLISH,
      datetime: new Date("2026-11-10T18:10:00.000Z"),
      bookingUrl: flamencoUrl,
    };

    expect(screeningMatchesGardenHeading(english, heading!)).toBe(true);
    expect(screeningMatchesGardenHeading(bilingual, heading!)).toBe(true);

    const plan = resolveSharedGardenPerformance([bilingual, english], heading);
    expect(plan.keep).toEqual([english]);
    expect(plan.drop).toEqual([bilingual]);

    const collapsed = collapseGardenTranslationDuplicates([bilingual, english]);
    expect(collapsed.keep).toEqual([english]);
    expect(collapsed.drop).toEqual([bilingual]);
  });

  it("does not collapse The Social Reckoning and Fatherland", () => {
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
    const plan = collapseGardenTranslationDuplicates([social, phantom]);
    expect(plan.drop).toEqual([]);
    expect(plan.keep).toEqual([social, phantom]);
  });
});
