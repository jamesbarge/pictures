import { describe, expect, it } from "vitest";
import { legacyScreeningCollides, type ScreeningIdentity } from "./canonicalize-cinema-ids";

function showing(overrides: Partial<ScreeningIdentity> = {}): ScreeningIdentity {
  return {
    filmId: "film-a",
    datetime: new Date("2026-10-18T15:30:00.000Z"),
    sourceId: "nickel-717",
    bookingUrl: "https://book.thenickel.co.uk/screening/717",
    ...overrides,
  };
}

describe("legacyScreeningCollides", () => {
  it("collides on the same film at the same time", () => {
    expect(legacyScreeningCollides(showing(), showing({ sourceId: null, bookingUrl: "https://other.example/1" }))).toBe(true);
  });

  it("collides when the same source id is stored under a different film title", () => {
    // The Nickel QA: `THE UNKNOWN (ON 16MM` and `The Unknown` share a booking URL.
    const legacy = showing({ filmId: "dirty-unknown" });
    const canonical = showing({ filmId: "clean-unknown" });
    expect(legacyScreeningCollides(legacy, canonical)).toBe(true);
  });

  it("collides on the same booking URL at the same instant when source ids differ", () => {
    const legacy = showing({ filmId: "dirty", sourceId: null });
    const canonical = showing({ filmId: "clean", sourceId: "other-source" });
    expect(legacyScreeningCollides(legacy, canonical)).toBe(true);
  });

  it("does not treat one film-page URL at two times as the same showing", () => {
    const legacy = showing({
      filmId: "paddington",
      sourceId: "rio-1",
      bookingUrl: "https://riocinema.org.uk/Rio.dll/WhatsOn?f=2888817",
      datetime: new Date("2026-10-24T15:00:00.000Z"),
    });
    const canonical = showing({
      filmId: "paddington-2",
      sourceId: "rio-2",
      bookingUrl: "https://riocinema.org.uk/Rio.dll/WhatsOn?f=2888817",
      datetime: new Date("2026-10-25T15:00:00.000Z"),
    });
    expect(legacyScreeningCollides(legacy, canonical)).toBe(false);
  });

  it("does not collide on a different showing", () => {
    const legacy = showing({ sourceId: "nickel-718", bookingUrl: "https://book.thenickel.co.uk/screening/718", filmId: "other" });
    const canonical = showing();
    expect(legacyScreeningCollides(legacy, canonical)).toBe(false);
  });
});
