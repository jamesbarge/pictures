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

/**
 * Calculate the center of a polygon
 */
export function getPolygonCenter(
  paths: Array<{ lat: number; lng: number }>
): { lat: number; lng: number } {
  if (paths.length === 0) {
    // Default to central London
    return { lat: 51.5074, lng: -0.1278 };
  }

  const sum = paths.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 }
  );

  return {
    lat: sum.lat / paths.length,
    lng: sum.lng / paths.length,
  };
}

/**
 * Calculate approximate area of a polygon in square kilometers
 */
export function getPolygonAreaKm2(
  paths: Array<{ lat: number; lng: number }>
): number {
  if (paths.length < 3) return 0;

  // Using the shoelace formula with approximation for lat/lng
  let area = 0;
  const n = paths.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += paths[i].lng * paths[j].lat;
    area -= paths[j].lng * paths[i].lat;
  }

  area = Math.abs(area) / 2;

  // Convert to approximate km² (1 degree ≈ 111km at equator, ~69km at London's latitude)
  const kmPerDegreeLat = 111;
  const kmPerDegreeLng = 69; // Approximate for London's latitude

  return area * kmPerDegreeLat * kmPerDegreeLng;
}
