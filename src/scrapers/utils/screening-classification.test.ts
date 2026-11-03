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

describe("classifyScreening: preview and festival labels from 24 Oct 2026", () => {
  it("keeps a BFI preview label when the scraper already set the event type", async () => {
    const metadata = await classifyScreening({
      filmTitle: "BFI IMAX exclusive preview: Godzilla Minus Zero",
      datetime: new Date("2026-11-02T20:30:00Z"),
      bookingUrl: "https://whatson.bfi.org.uk/imax/Online/example",
      eventType: "preview",
    });

    expect(metadata.eventType).toBe("preview");
    expect(metadata.eventDescription).toBe("BFI IMAX exclusive preview");
  });

  it("keeps Special preview as the note and does not invent a director", async () => {
    const metadata = await classifyScreening({
      filmTitle: "Special preview: La Bola Negra",
      datetime: new Date("2026-11-04T20:30:00Z"),
      bookingUrl: "https://whatson.bfi.org.uk/imax/Online/example",
      eventType: "preview",
    });

    expect(metadata.eventDescription).toBe("Special preview");
  });

  it("keeps the festival name as the note on Traces", async () => {
    const metadata = await classifyScreening({
      filmTitle: "Women and the World Festival: Traces",
      datetime: new Date("2026-11-07T18:00:00Z"),
      bookingUrl: "https://dochouse.org/event/women-and-the-world-festival-traces/",
    });

    expect(metadata.eventDescription).toBe("Women and the World Festival");
  });

  it("does not replace a note the scraper already supplied", async () => {
    const metadata = await classifyScreening({
      filmTitle: "Special preview: La Bola Negra",
      datetime: new Date("2026-11-04T20:30:00Z"),
      bookingUrl: "https://whatson.bfi.org.uk/imax/Online/example",
      eventType: "preview",
      eventDescription: "Sold out preview",
    });

    expect(metadata.eventDescription).toBe("Sold out preview");
  });
});

describe("classifyScreening: Trans Awareness programme strand", () => {
  it("keeps Castle's strand as the note and leaves the film title to the cleaner", async () => {
    const metadata = await classifyScreening({
      filmTitle: "Ponyboi - Trans Awareness programme 2026",
      datetime: new Date("2026-11-08T11:00:00Z"),
      bookingUrl: "https://thecastlecinema.com/bookings/17938/",
    });

    expect(metadata.eventDescription).toBe("Trans Awareness programme 2026");
  });

  it("does not replace a note the scraper already supplied", async () => {
    const metadata = await classifyScreening({
      filmTitle: "Ponyboi - Trans Awareness programme 2026",
      datetime: new Date("2026-11-08T11:00:00Z"),
      bookingUrl: "https://thecastlecinema.com/bookings/17938/",
      eventDescription: "Sold out",
    });

    expect(metadata.eventDescription).toBe("Sold out");
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

describe("classifyScreening: 3 Nov 2026 guest, preview and strand notes", () => {
  it("keeps Ben Rivers as the note and Don DeLillo at 90 as the season", async () => {
    const metadata = await classifyScreening({
      filmTitle: "Don DeLillo at 90: Cosmopolis with Ben Rivers",
      datetime: new Date("2026-11-17T20:00:00Z"),
      bookingUrl: "https://bookings.thegardencinema.co.uk/TheGardenCinema.dll/TcsPerformance_6283015",
    });
    expect(metadata.eventDescription).toBe("with Ben Rivers");
    expect(metadata.season).toBe("Don DeLillo at 90");
  });

  it("keeps the year-and-guest credit as the note", async () => {
    const metadata = await classifyScreening({
      filmTitle: "Cosmopolis (2012) with Ben Rivers",
      datetime: new Date("2026-11-17T20:00:00Z"),
      bookingUrl: "https://bookings.thegardencinema.co.uk/TheGardenCinema.dll/TcsPerformance_6283015",
    });
    expect(metadata.eventDescription).toBe("with Ben Rivers");
    expect(metadata.season).toBeNull();
  });

  it("keeps London Preview as the note", async () => {
    const metadata = await classifyScreening({
      filmTitle: '"Terrorists" - London Preview',
      datetime: new Date("2026-11-16T18:30:00Z"),
      bookingUrl: "https://genesis.admit-one.co.uk/seats/?perfCode=14072",
    });
    expect(metadata.eventDescription).toBe("London Preview");
  });

  it("keeps Castle's capitalised programme as the note", async () => {
    const metadata = await classifyScreening({
      filmTitle: "My Political Biography - Trans Awareness Programme 2026",
      datetime: new Date("2026-11-17T18:30:00Z"),
      bookingUrl: "https://thecastlecinema.com/interstitial/pwyc/17940/show",
    });
    expect(metadata.eventDescription).toBe("Trans Awareness Programme 2026");
  });

  it("does not replace a note the scraper already supplied", async () => {
    const metadata = await classifyScreening({
      filmTitle: '"Terrorists" - London Preview',
      datetime: new Date("2026-11-16T18:30:00Z"),
      bookingUrl: "https://genesis.admit-one.co.uk/seats/?perfCode=14072",
      eventType: "q_and_a",
      eventDescription: "Also: preview",
    });
    expect(metadata.eventDescription).toBe("Also: preview");
  });
});
