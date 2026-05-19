import { describe, expect, it } from "vitest";
import {
  cinemaToVenue,
  getVenueFromRegistry,
} from "./venue-from-registry";
import { getCinemaById } from "@/config/cinema-registry";

// Use a known-real cinema (BFI Southbank) as a fixture so we don't have to
// stub the registry. The shape contract is what we're testing.

describe("cinemaToVenue", () => {
  it("converts a CinemaDefinition into a VenueDefinition with all required fields", () => {
    const bfi = getCinemaById("bfi-southbank");
    if (!bfi) throw new Error("test fixture missing: bfi-southbank");

    const venue = cinemaToVenue(bfi);
    expect(venue.id).toBe(bfi.id);
    expect(venue.name).toBe(bfi.name);
    expect(venue.shortName).toBe(bfi.shortName);
    expect(venue.website).toBe(bfi.website);
    expect(venue.address.street).toBe(bfi.address.street);
    expect(venue.address.area).toBe(bfi.address.area);
    expect(venue.address.postcode).toBe(bfi.address.postcode);
  });

  it("does NOT include the borough field on the venue address (CinemaDefinition has it, VenueDefinition does not)", () => {
    const bfi = getCinemaById("bfi-southbank");
    if (!bfi) throw new Error("test fixture missing: bfi-southbank");

    const venue = cinemaToVenue(bfi);
    // The transformer explicitly picks {street, area, postcode} — borough is
    // omitted. Pinning this so a refactor doesn't accidentally widen the
    // VenueDefinition shape and leak borough into scraper output.
    expect((venue.address as Record<string, unknown>).borough).toBeUndefined();
  });

  it("converts null chain to undefined (explicit chain ?? undefined transform)", () => {
    // The function does `chain: cinema.chain ?? undefined` — for cinemas
    // without a chain (independents), the venue's chain field becomes
    // undefined rather than null. Pin this transform.
    const independent = getCinemaById("rio-dalston");
    if (!independent) throw new Error("test fixture missing: rio-dalston");

    const venue = cinemaToVenue(independent);
    if (independent.chain === null || independent.chain === undefined) {
      expect(venue.chain).toBeUndefined();
    }
  });

  it("preserves features array reference", () => {
    const bfi = getCinemaById("bfi-southbank");
    if (!bfi) throw new Error("test fixture missing: bfi-southbank");

    const venue = cinemaToVenue(bfi);
    expect(venue.features).toBe(bfi.features);
  });
});

describe("getVenueFromRegistry", () => {
  it("returns a VenueDefinition for a known cinema ID", () => {
    const venue = getVenueFromRegistry("bfi-southbank");
    expect(venue.id).toBe("bfi-southbank");
    expect(venue.name).toBe("BFI Southbank");
  });

  it("throws when the cinema ID is not in the registry", () => {
    expect(() => getVenueFromRegistry("nonexistent-cinema-xyz")).toThrow(
      /not found in registry/,
    );
  });

  it("error message includes the missing ID for grep-ability", () => {
    expect(() => getVenueFromRegistry("xyzzy-plugh")).toThrow(/xyzzy-plugh/);
  });
});
