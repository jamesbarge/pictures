import { describe, expect, it } from "vitest";

import { classifyScreening } from "./screening-classification";

describe("classifyScreening: scraper-supplied event type", () => {
  it("marks a scraper's relaxed event type as a relaxed screening", async () => {
    // A scraper that names the event type skips title classification, which
    // is the only other place isRelaxedScreening is set (David Lean moves
    // "(Relaxed Screening)" out of the title into eventType).
    const metadata = await classifyScreening({
      filmTitle: "SCHOOL OF ROCK",
      datetime: new Date("2026-10-24T10:00:00Z"),
      bookingUrl: "https://example.com/book",
      eventType: "relaxed",
      eventDescription: "Relaxed Screening",
    });

    expect(metadata.eventType).toBe("relaxed");
    expect(metadata.isRelaxedScreening).toBe(true);
  });

  it("leaves other scraper-supplied event types unflagged", async () => {
    const metadata = await classifyScreening({
      filmTitle: "SCHOOL OF ROCK",
      datetime: new Date("2026-10-24T10:00:00Z"),
      bookingUrl: "https://example.com/book",
      eventType: "q_and_a",
    });

    expect(metadata.isRelaxedScreening).toBe(false);
  });
});
