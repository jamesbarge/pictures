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

describe("classifyScreening: listing extras from 23 Oct 2026", () => {
  it("stores the live act as the note and leaves a double bill alone", async () => {
    const live = await classifyScreening({
      filmTitle: "Endless Night (1972) + The Swinging Christies LIVE!",
      datetime: new Date("2026-11-04T18:30:00Z"),
      bookingUrl: "https://thecastlecinema.com/bookings/17081/",
    });
    expect(live.eventDescription).toBe("The Swinging Christies LIVE!");

    const bill = await classifyScreening({
      filmTitle: "Blacula + Ma",
      datetime: new Date("2026-11-04T18:30:00Z"),
      bookingUrl: "https://example.com/bill",
    });
    expect(bill.eventDescription).toBeUndefined();
  });
});

describe("classifyScreening: accessibility in the title", () => {
  const disclosure =
    "Disclosure Day (with subtitles for the D/deaf and those experiencing hearing loss)";

  it("flags subtitles when the title is the only signal", async () => {
    const metadata = await classifyScreening({
      filmTitle: disclosure,
      datetime: new Date("2026-10-26T16:15:00Z"),
      bookingUrl: "https://whatson.bfi.org.uk/imax/example",
    });

    expect(metadata.hasSubtitles).toBe(true);
  });

  it("keeps a scraper-supplied format and still flags subtitles", async () => {
    const metadata = await classifyScreening({
      filmTitle: disclosure,
      datetime: new Date("2026-10-26T16:15:00Z"),
      bookingUrl: "https://whatson.bfi.org.uk/imax/example",
      format: "imax",
    });

    expect(metadata.format).toBe("imax");
    expect(metadata.hasSubtitles).toBe(true);
  });
});
