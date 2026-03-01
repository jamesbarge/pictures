"use client";

import { X } from "lucide-react";
import { useFilters } from "@/stores/filters";
import { usePreferences } from "@/stores/preferences";
import { Button } from "@/components/ui";

/** Clear All Filters Button */
export function ClearFiltersButton({ fullWidth }: { fullWidth?: boolean } = {}) {
  const filters = useFilters();
  const { clearMapArea } = usePreferences();

  // Access state properties directly to create Zustand subscriptions
  // (calling getActiveFilterCount() alone doesn't trigger re-renders)
  const count =
    (filters.filmSearch.trim() ? 1 : 0) +
    (filters.cinemaIds.length > 0 ? 1 : 0) +
    (filters.dateFrom || filters.dateTo ? 1 : 0) +
    (filters.timeFrom !== null || filters.timeTo !== null ? 1 : 0) +
    filters.formats.length +
    filters.programmingTypes.length +
    filters.decades.length +
    filters.genres.length +
    filters.timesOfDay.length +
    (filters.festivalSlug ? 1 : 0) +
    (filters.festivalOnly ? 1 : 0) +
    (filters.seasonSlug ? 1 : 0) +
    (filters.hideSeen ? 1 : 0) +
    (filters.onlySingleShowings ? 1 : 0);
    // Note: hideNotInterested is NOT counted - it's the default behavior

  if (count === 0) return null;

  const handleClear = () => {
    filters.clearAllFilters();
    clearMapArea(); // Also clear map polygon when clearing all filters
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClear}
      leftIcon={<X className="w-4 h-4" />}
      className={fullWidth ? "w-full justify-center" : undefined}
    >
      Clear ({count})
    </Button>
  );
}
