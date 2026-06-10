import { describe, expect, it } from "vitest";

import {
  buildIcsEvent,
  escapeIcalText,
  safeHttpUrl,
  type IcalScreeningData,
} from "./ical";

const screening: IcalScreeningData = {
  id: "screening-1",
  datetime: new Date("2026-06-09T18:30:00.000Z"),
  format: "35mm",
  screen: null,
  eventType: null,
  bookingUrl: "https://cinema.example/book?id=123",
  filmTitle: "A Film",
  filmYear: 2026,
  filmRuntime: 90,
  cinemaName: "A Cinema",
  cinemaAddress: {
    street: "1 High Street",
    area: "London",
    postcode: "E1 1AA",
  },
};

describe("iCal serialization", () => {
  it("normalizes all newline variants before escaping text", () => {
    expect(escapeIcalText("one\r\ntwo\rthree\nfour")).toBe(
      "one\\ntwo\\nthree\\nfour",
    );
  });

  it("only accepts HTTP and HTTPS URLs", () => {
    expect(safeHttpUrl("https://cinema.example/book?id=123")).toBe(
      "https://cinema.example/book?id=123",
    );
    expect(safeHttpUrl("http://cinema.example/book")).toBe(
      "http://cinema.example/book",
    );
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/plain,hello")).toBeNull();
    expect(safeHttpUrl("not a URL")).toBeNull();
  });

  it("prevents text fields from injecting new iCal properties", () => {
    const event = buildIcsEvent({
      ...screening,
      filmTitle: "A Film\r\nX-EVIL: injected",
      cinemaName: "A Cinema\rX-OTHER: injected",
    });

    expect(event).not.toContain("\r\nX-EVIL:");
    expect(event).not.toContain("\r\nX-OTHER:");
    expect(event).toContain("A Film\\nX-EVIL: injected");
    expect(event).toContain("A Cinema\\nX-OTHER: injected");
  });

  it("omits unsafe booking URLs from the URL property and description", () => {
    const event = buildIcsEvent({
      ...screening,
      bookingUrl: "javascript:alert(1)",
    });

    expect(event).not.toContain("\r\nURL:");
    expect(event).not.toContain("Book:");
    expect(event).not.toContain("javascript:");
  });

  it("serializes valid booking URLs without raw newlines", () => {
    const event = buildIcsEvent({
      ...screening,
      bookingUrl: "https://cinema.example/book\r\nX-EVIL: injected",
    });

    expect(event).not.toContain("\r\nX-EVIL:");
    expect(event).toContain("\r\nURL:https://cinema.example/bookX-EVIL:%20injected\r\n");
  });
});
