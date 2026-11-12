import { describe, expect, it } from "vitest";

import {
  bookingUrlIdentifiesAShowing,
  classifyScreening,
  isSameTicketSlot,
} from "./screening-classification";

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

describe("classifyScreening: 31 Oct 2026 strands and extras", () => {
  it("keeps Scotland Loves Anime on the note and the season", async () => {
    const metadata = await classifyScreening({
      filmTitle: "SLA 2026: A Silent Voice",
      datetime: new Date("2026-11-12T19:20:00Z"),
      bookingUrl: "https://www.picturehouses.com/movie-details/022/HO00018763/sla-2026-a-silent-voice",
    });

    expect(metadata.eventDescription).toBe("SLA 2026");
    expect(metadata.season).toBe("SLA 2026");
  });

  it("keeps a scraper note and still records the SLA season", async () => {
    const metadata = await classifyScreening({
      filmTitle: "SLA 2026: Ninja Scroll",
      datetime: new Date("2026-11-13T20:10:00Z"),
      bookingUrl: "https://www.picturehouses.com/movie-details/022/HO00018764/sla-2026-ninja-scroll-4k-restoration",
      format: "dcp_4k",
      eventDescription: "(4K restoration)",
    });

    expect(metadata.eventDescription).toBe("(4K restoration)");
    expect(metadata.season).toBe("SLA 2026");
    expect(metadata.format).toBe("dcp_4k");
  });

  it("keeps the Bubblegum club as the note and the season", async () => {
    const metadata = await classifyScreening({
      filmTitle: "All Out Of Bubblegum Film Club: THE SHINING",
      datetime: new Date("2026-11-11T18:25:00Z"),
      bookingUrl: "https://riocinema.org.uk/Rio.dll/WhatsOn?f=2968228",
    });

    expect(metadata.eventDescription).toBe("All Out Of Bubblegum Film Club");
    expect(metadata.season).toBe("All Out Of Bubblegum Film Club");
  });

  it("keeps Garden's cocktails and intro as the note, not the film title", async () => {
    const metadata = await classifyScreening({
      filmTitle: "Italian cocktails, Morricone musical intro + Ennio",
      datetime: new Date("2026-11-13T19:00:00Z"),
      bookingUrl:
        "https://bookings.thegardencinema.co.uk/TheGardenCinema.dll/TSelectItems.waSelectItemsPrompt.TcsWebMenuItem_0.TcsWebTab_0.TcsPerformance_6439982.TcsSection_6439902",
    });

    expect(metadata.eventDescription).toBe("Italian cocktails, Morricone musical intro");
    expect(metadata.season).toBeNull();
  });
});

describe("same ticket link", () => {
  const at = new Date("2026-11-14T09:00:00Z");
  const peppa = "https://purchase.everymancinema.com/launch/ticketing/e15ea082-dd77-5b68-b9eb-cfc91bc7b197";

  it("treats one Everyman ticketing UUID at one clock and screen as one showing", () => {
    expect(bookingUrlIdentifiesAShowing(peppa)).toBe(true);
    expect(
      isSameTicketSlot(
        { bookingUrl: peppa, datetime: at, screen: null },
        { bookingUrl: peppa, datetime: at, screen: null },
      ),
    ).toBe(true);
  });

  it("keeps two screens that share a film-level link", () => {
    const picturehouse = "https://www.picturehouses.com/movie-details/022/HO00018763/some-film";
    expect(
      isSameTicketSlot(
        { bookingUrl: picturehouse, datetime: at, screen: "Screen 1" },
        { bookingUrl: picturehouse, datetime: at, screen: "Screen 2" },
      ),
    ).toBe(false);
  });

  it("ignores a shared homepage and a clock more than two minutes away", () => {
    expect(bookingUrlIdentifiesAShowing("https://www.picturehouses.com/whats-on")).toBe(false);
    expect(bookingUrlIdentifiesAShowing("")).toBe(false);
    expect(
      isSameTicketSlot(
        { bookingUrl: peppa, datetime: at, screen: null },
        { bookingUrl: peppa, datetime: new Date(at.getTime() + 180_000), screen: null },
      ),
    ).toBe(false);
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
