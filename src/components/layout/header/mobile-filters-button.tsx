"use client";

import { SlidersHorizontal, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFilters } from "@/stores/filters";

/** Mobile Filters Button with active count indicator */
export function MobileFiltersButton({
  isOpen,
  onClick,
  mounted,
}: {
  isOpen: boolean;
  onClick: () => void;
  mounted: boolean;
}) {
  const filters = useFilters();

  // Access state properties directly to create Zustand subscriptions
  // (calling getActiveFilterCount() alone doesn't trigger re-renders)
  const count = mounted
    ? (filters.filmSearch.trim() ? 1 : 0) +
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
      (filters.onlySingleShowings ? 1 : 0)
      // Note: hideNotInterested is NOT counted - it's the default behavior
    : 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
        isOpen || count > 0
          ? "bg-accent-primary/10 border-accent-primary/30 text-accent-primary"
          : "bg-background-secondary border-border-default text-text-secondary"
      )}
    >
      <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
      <span>Filters</span>
      {count > 0 && (
        <span className="bg-accent-primary text-text-inverse text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
          {count}
        </span>
      )}
      <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
    </button>
  );
}
