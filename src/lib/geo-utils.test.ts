import { describe, expect, it } from "vitest";
import { getCinemasInArea, isCinemaInArea, type MapArea } from "./geo-utils";
import type { CinemaCoordinates } from "@/types/cinema";

// London-shaped test polygon (rough Central London rectangle).
const CENTRAL_LONDON_AREA: MapArea = {
  type: "polygon",
  paths: [
    { lat: 51.55, lng: -0.20 }, // NW
    { lat: 51.55, lng: -0.05 }, // NE
    { lat: 51.48, lng: -0.05 }, // SE
    { lat: 51.48, lng: -0.20 }, // SW
  ],
};

// Coordinates inside the rectangle (Trafalgar Square area).
const TRAFALGAR_SQUARE: CinemaCoordinates = { lat: 51.508, lng: -0.128 };

// Coordinates outside the rectangle (Greenwich).
const GREENWICH: CinemaCoordinates = { lat: 51.481, lng: 0.0 };

describe("isCinemaInArea", () => {
  it("returns true when the cinema is inside the polygon", () => {
    expect(isCinemaInArea(TRAFALGAR_SQUARE, CENTRAL_LONDON_AREA)).toBe(true);
  });

  it("returns false when the cinema is outside the polygon", () => {
    expect(isCinemaInArea(GREENWICH, CENTRAL_LONDON_AREA)).toBe(false);
  });

  it("returns false for null coordinates", () => {
    expect(
      isCinemaInArea(null as unknown as CinemaCoordinates, CENTRAL_LONDON_AREA),
    ).toBe(false);
  });

  it("returns false for null area", () => {
    expect(isCinemaInArea(TRAFALGAR_SQUARE, null as unknown as MapArea)).toBe(
      false,
    );
  });

  it("returns false for a polygon with fewer than 3 paths", () => {
    // A polygon needs at least 3 vertices to enclose area. Pin the guard.
    const degenerate: MapArea = {
      type: "polygon",
      paths: [
        { lat: 51.5, lng: -0.1 },
        { lat: 51.6, lng: -0.1 },
      ],
    };
    expect(isCinemaInArea(TRAFALGAR_SQUARE, degenerate)).toBe(false);
  });

  it("returns false for a polygon with empty paths", () => {
    const empty: MapArea = { type: "polygon", paths: [] };
    expect(isCinemaInArea(TRAFALGAR_SQUARE, empty)).toBe(false);
  });

  it("does not require an explicit closing point in the input (auto-closes)", () => {
    // The implementation pushes the first point again to close the GeoJSON
    // polygon. So callers can supply 3+ paths without re-stating the first.
    const triangle: MapArea = {
      type: "polygon",
      paths: [
        { lat: 51.55, lng: -0.20 },
        { lat: 51.55, lng: -0.05 },
        { lat: 51.48, lng: -0.13 },
      ],
    };
    expect(isCinemaInArea(TRAFALGAR_SQUARE, triangle)).toBe(true);
  });

  it("handles point right on a polygon edge consistently", () => {
    // The behaviour for on-edge points is implementation-defined by Turf.js;
    // we don't assert a specific true/false but ensure no throw.
    const onEdge: CinemaCoordinates = { lat: 51.55, lng: -0.10 };
    expect(() => isCinemaInArea(onEdge, CENTRAL_LONDON_AREA)).not.toThrow();
  });
});

describe("getCinemasInArea", () => {
  const cinemas = [
    { id: "a", coordinates: TRAFALGAR_SQUARE },
    { id: "b", coordinates: GREENWICH },
    { id: "c", coordinates: null },
    { id: "d", coordinates: { lat: 51.51, lng: -0.13 } as CinemaCoordinates }, // also inside
  ];

  it("returns all cinemas unchanged when area is null", () => {
    expect(getCinemasInArea(cinemas, null)).toEqual(cinemas);
  });

  it("returns only cinemas inside the polygon", () => {
    const result = getCinemasInArea(cinemas, CENTRAL_LONDON_AREA);
    expect(result.map((c) => c.id)).toEqual(["a", "d"]);
  });

  it("skips cinemas with null coordinates", () => {
    // Cinema 'c' has null coords; the filter explicitly skips it.
    const result = getCinemasInArea(cinemas, CENTRAL_LONDON_AREA);
    expect(result.some((c) => c.id === "c")).toBe(false);
  });

  it("returns empty array when no cinemas are inside the polygon", () => {
    const outside = [
      { id: "a", coordinates: GREENWICH },
      { id: "b", coordinates: { lat: 0, lng: 0 } as CinemaCoordinates },
    ];
    expect(getCinemasInArea(outside, CENTRAL_LONDON_AREA)).toEqual([]);
  });

  it("preserves input order for cinemas that pass the filter", () => {
    const ordered = [
      { id: "d", coordinates: { lat: 51.51, lng: -0.13 } as CinemaCoordinates },
      { id: "a", coordinates: TRAFALGAR_SQUARE },
    ];
    const result = getCinemasInArea(ordered, CENTRAL_LONDON_AREA);
    expect(result.map((c) => c.id)).toEqual(["d", "a"]);
  });
});
