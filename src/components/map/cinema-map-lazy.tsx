/**
 * Lazy-loaded Cinema Map Component
 * Uses dynamic import to defer loading the Google Maps SDK until needed
 * This reduces initial bundle size and improves page load performance
 */

"use client";

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import type { MapArea } from "@/lib/geo-utils";
import type { CinemaCoordinates } from "@/types/cinema";

interface Cinema {
  id: string;
  name: string;
  shortName: string | null;
  coordinates: CinemaCoordinates | null;
}

interface CinemaMapLazyProps {
  cinemas: Cinema[];
  mapArea: MapArea | null;
  onAreaChange: (area: MapArea | null) => void;
}

/**
 * Loading skeleton shown while Google Maps SDK downloads
 */
function MapLoadingSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-background-secondary rounded-xl">
      <div className="text-center">
        <MapPin className="w-8 h-8 text-text-tertiary mx-auto mb-2 animate-pulse" />
        <p className="text-text-secondary text-sm">Loading map...</p>
      </div>
    </div>
  );
}

/**
 * Dynamically imported CinemaMap - defers loading of @vis.gl/react-google-maps
 * ssr: false ensures the heavy SDK only loads on the client
 */
const CinemaMapDynamic = dynamic(
  () => import("./cinema-map").then((mod) => mod.CinemaMap),
  {
    loading: MapLoadingSkeleton,
    ssr: false,
  }
);

/**
 * Dynamically imported MapProvider - defers loading of Google Maps API provider
 */
const MapProviderDynamic = dynamic(
  () => import("./map-provider").then((mod) => mod.MapProvider),
  {
    ssr: false,
  }
);

/**
 * Lazy-loaded map with provider
 * Wraps CinemaMap with MapProvider, both loaded dynamically
 */
export function CinemaMapLazy({ cinemas, mapArea, onAreaChange }: CinemaMapLazyProps) {
  return (
    <MapProviderDynamic>
      <CinemaMapDynamic
        cinemas={cinemas}
        mapArea={mapArea}
        onAreaChange={onAreaChange}
      />
    </MapProviderDynamic>
  );
}
