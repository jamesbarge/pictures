/**
 * Screening Filters Component
 * Compact filter bar for film detail page screenings
 */

"use client";

import { X } from "lucide-react";
import { CinemaSearchFilter } from "./cinema-search-filter";
import { TimeRangeFilter } from "./time-range-filter";
import { ScreeningDateFilter } from "./screening-date-filter";

export interface FilmScreeningFilters {
  cinemaSearch: string;
  timeFrom: number | null; // hour 0-23
  timeTo: number | null;
  selectedDates: Date[] | null;
}

interface ScreeningFiltersProps {
  filters: FilmScreeningFilters;
  onFiltersChange: (filters: FilmScreeningFilters) => void;
  availableDates: Date[];
  screeningCount: number;
  filteredCount: number;
}

export function ScreeningFilters({
  filters,
  onFiltersChange,
  availableDates,
  screeningCount,
  filteredCount,
}: ScreeningFiltersProps) {
  const hasActiveFilters =
    filters.cinemaSearch.trim() !== "" ||
    filters.timeFrom !== null ||
    filters.timeTo !== null ||
    (filters.selectedDates && filters.selectedDates.length > 0);

  const handleClearAll = () => {
    onFiltersChange({
      cinemaSearch: "",
      timeFrom: null,
      timeTo: null,
      selectedDates: null,
    });
  };

  return (
    <div className="space-y-3 mb-6">
      {/* Main filter row */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        {/* Cinema search */}
        <div className="flex-1 sm:max-w-xs">
          <CinemaSearchFilter
            value={filters.cinemaSearch}
            onChange={(value) =>
              onFiltersChange({ ...filters, cinemaSearch: value })
            }
          />
        </div>

        {/* Time range */}
        <TimeRangeFilter
          timeFrom={filters.timeFrom}
          timeTo={filters.timeTo}
          onChange={(from, to) =>
            onFiltersChange({ ...filters, timeFrom: from, timeTo: to })
          }
        />

        {/* Clear all (only show if filters active) */}
        {hasActiveFilters && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-text-tertiary hover:text-text-primary hover:bg-surface-overlay-hover transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Date pills row */}
      {availableDates.length > 1 && (
        <ScreeningDateFilter
          availableDates={availableDates}
          selectedDates={filters.selectedDates}
          onChange={(dates) =>
            onFiltersChange({ ...filters, selectedDates: dates })
          }
        />
      )}

      {/* Results count */}
      {hasActiveFilters && (
        <p className="text-sm text-text-tertiary">
          Showing {filteredCount} of {screeningCount}{" "}
          {screeningCount === 1 ? "screening" : "screenings"}
        </p>
      )}
    </div>
  );
}

// Re-export filter type for consumers
export type { FilmScreeningFilters as ScreeningFiltersState };
