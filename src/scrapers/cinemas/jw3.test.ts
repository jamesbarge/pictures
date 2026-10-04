import { describe, expect, it } from "vitest";
import { jw3FilmTitle } from "./jw3";

/**
 * Event names and genres are verbatim from the Spektrix feed
 * (https://ticket.jw3.org.uk/jw3/api/v3/events) on 2026-10-04. The feed has
 * no structured field that marks a film night filed outside the "Cinema"
 * genre: genre, seating plan and every attribute_* field match the
 * workshops around them, so the event name is the only signal.
 */
const event = (attribute_Genre: string, name: string) => ({ id: "x", name, attribute_Genre });

describe("jw3FilmTitle", () => {
  it("keeps every Cinema-genre event under its own name", () => {
    expect(jw3FilmTitle(event("Cinema", "  Hamnet  "))).toBe("Hamnet");
    expect(jw3FilmTitle(event("cinema", "Hamnet"))).toBe("Hamnet");
  });

  it.each([
    ["Young JW3 Queer Movie & Pizza Night: Call Me By Your Name", "Call Me By Your Name"],
    ["Young JW3 Queer Movie & Pizza Night: Theater Camp", "Theater Camp"],
    // Past (27 Jul 2026), same strand, different label.
    ["Young JW3 x Young UJIA: Film Club: Entebbe", "Entebbe"],
  ])("keeps the Young Professionals film night %j as %j", (name, title) => {
    expect(jw3FilmTitle(event("Young Professionals", name))).toBe(title);
  });

  it.each([
    // Film in the name, but an awards evening for festival shorts ticketed by UKJF.
    ["Young Professionals", "Young JW3 & UK Jewish Film Festival present: Young Jury Award for Best Short Film 2026"],
    // "Night" without a film label.
    ["Young Professionals", "Young JW3 Friday Night Dinner"],
    ["Young Professionals", "Craft Café: Candle Painting"],
    // Talks whose descriptions mention films, clips or screenings.
    ["Talks & Discussions", "Margaret Lockwood: Not a Wicked Lady"],
    ["Talks & Discussions", "The Fox Blondes"],
    ["Talks & Discussions", "The Rescue of the Jews of Syria (1970-1994)"],
    // A TV episode screening.
    ["Arts & Culture", "Zaguri Imperia & Q&A"],
    ["Walks", "Mayfair Walk – with a Jewish Twist!"],
  ])("drops %s event %j", (genre, name) => {
    expect(jw3FilmTitle(event(genre, name))).toBeNull();
  });

  it("drops a film-night label with nothing after the colon", () => {
    expect(jw3FilmTitle(event("Young Professionals", "Young JW3 Queer Movie & Pizza Night:"))).toBeNull();
    expect(jw3FilmTitle(event("Young Professionals", "Young JW3 Queer Movie & Pizza Night"))).toBeNull();
  });

  it("drops an event with no genre and no film-night label", () => {
    expect(jw3FilmTitle({ id: "x", name: "Mitzvah Day" })).toBeNull();
  });
});
