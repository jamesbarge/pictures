/**
 * Map Page Client Component
 * Handles the interactive map and state management
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Check, X } from "lucide-react";
import { CinemaMapLazy } from "@/components/map/cinema-map-lazy";
import { usePreferences } from "@/stores/preferences";
import { useFilters } from "@/stores/filters";
import { useHydrated } from "@/hooks/useHydrated";
import { useDiscovery } from "@/stores/discovery";
import { getCinemasInArea } from "@/lib/geo-utils";
import type { CinemaCoordinates } from "@/types/cinema";
import type { MapArea } from "@/lib/geo-utils";

interface Cinema {
  id: string;
  name: string;
  shortName: string | null;
  coordinates: CinemaCoordinates | null;
}

interface MapPageClientProps {
  cinemas: Cinema[];
}

export function MapPageClient({ cinemas }: MapPageClientProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const { mapArea, setMapArea, useMapFiltering } = usePreferences();
  const { setCinemas } = useFilters();

  // Local draft state for editing (doesn't save until "Apply")
  // `undefined` means "use persisted mapArea from store"
  const [localAreaOverride, setLocalAreaOverride] = useState<MapArea | null | undefined>(undefined);

  // Track that user has visited this feature (for discovery banner)
  useEffect(() => {
    useDiscovery.getState().markFeatureVisited("map");
  }, []);

  const localArea =
    localAreaOverride === undefined ? (hydrated ? mapArea : null) : localAreaOverride;
  const hasChanges =
    hydrated && JSON.stringify(localArea) !== JSON.stringify(mapArea);

  const handleApply = () => {
    // Save the map area for re-editing later
    setMapArea(localArea);

    // Set cinema filter to only include cinemas within the drawn area
    if (localArea) {
      const cinemasInSelectedArea = getCinemasInArea(cinemas, localArea);
      setCinemas(cinemasInSelectedArea.map((c) => c.id));
    } else {
      // No area = clear cinema filter (show all)
      setCinemas([]);
    }

    router.push("/");
  };

  const handleCancel = () => {
    router.push("/");
  };

  const handleClear = () => {
    setLocalAreaOverride(null);
    setMapArea(null);
    // Also clear the cinema filter
    setCinemas([]);
  };

  // Calculate cinemas in local area for preview
  const cinemasInArea = localArea
    ? getCinemasInArea(cinemas, localArea)
    : cinemas;

  return (
    <div className="min-h-screen bg-background-primary flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background-primary border-b border-border-subtle">
        <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Back Link */}
          <Link
            href="/"
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-display text-lg">Cinema Map</span>
          </Link>

          {/* Actions - reserve space for Clear button to prevent CLS */}
          <div className="flex items-center gap-2">
            <div className="w-[70px] sm:w-[85px]">
              {localArea && (
                <button
                  onClick={handleClear}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-accent-danger transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              )}
            </div>
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary bg-background-secondary rounded-lg border border-border-default transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!hasChanges && !localArea}
              className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-text-inverse bg-accent-primary hover:bg-accent-primary-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              <span>Apply Filter</span>
            </button>
          </div>
        </div>
      </header>

      {/* Map Container - needs explicit height for Google Maps */}
      <main className="flex-1 relative min-h-0">
        <div className="absolute inset-0">
          {hydrated ? (
            <CinemaMapLazy
              cinemas={cinemas}
              mapArea={localArea}
              onAreaChange={setLocalAreaOverride}
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-background-secondary">
              <div className="text-center">
                <MapPin className="w-8 h-8 text-text-tertiary mx-auto mb-2 animate-pulse" />
                <p className="text-text-secondary">Loading map...</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer Status Bar - reserve space for filter status to prevent CLS */}
      <footer className="sticky bottom-0 bg-background-primary border-t border-border-subtle">
        <div className="px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between min-h-[52px]">
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-accent-primary" />
            <span className="text-text-primary font-medium">
              {cinemasInArea.length} of {cinemas.length} cinemas
            </span>
            {localArea && (
              <span className="text-text-secondary">in selected area</span>
            )}
          </div>

          {/* Current filter status - reserve space to prevent CLS */}
          <div className="min-w-[140px] flex justify-end">
            {hydrated && useMapFiltering && mapArea && (
              <div className="flex items-center gap-2 text-sm text-accent-primary">
                <Check className="w-4 h-4" />
                <span>Map filter active</span>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
