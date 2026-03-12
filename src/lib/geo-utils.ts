/**
 * Geographic utilities for cinema filtering
 * Uses Turf.js for point-in-polygon calculations
 */

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon } from "@turf/helpers";
import type { CinemaCoordinates } from "@/types/cinema";

/** A geographic area defined by a closed polygon of lat/lng points */
export interface MapAreaPolygon {
  type: "polygon";
  paths: Array<{ lat: number; lng: number }>;
}

/** Union type for supported map area shapes (currently polygon only) */
export type MapArea = MapAreaPolygon;

/**
 * Check if a cinema is within the defined map area
 */
export function isCinemaInArea(
  coordinates: CinemaCoordinates,
  area: MapArea
): boolean {
  if (!coordinates || !area) return false;

  const cinemaPoint = point([coordinates.lng, coordinates.lat]);

  if (area.type === "polygon" && area.paths && area.paths.length >= 3) {
    // Convert paths to GeoJSON polygon format
    // GeoJSON requires [lng, lat] order and the polygon must be closed
    const coords = area.paths.map((p) => [p.lng, p.lat]);
    // Close the polygon by adding the first point at the end
    coords.push([area.paths[0].lng, area.paths[0].lat]);

    try {
      const areaPolygon = polygon([coords]);
      return booleanPointInPolygon(cinemaPoint, areaPolygon);
    } catch {
      // Invalid polygon
      return false;
    }
  }

  return false;
}

/**
 * Filter cinemas by map area
 */
export function getCinemasInArea<
  T extends { coordinates: CinemaCoordinates | null }
>(cinemas: T[], area: MapArea | null): T[] {
  if (!area) return cinemas;
  return cinemas.filter((c) => c.coordinates && isCinemaInArea(c.coordinates, area));
}

