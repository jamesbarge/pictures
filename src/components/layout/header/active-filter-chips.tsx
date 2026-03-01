"use client";

import { X } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { useFilters, FORMAT_OPTIONS, formatTimeRange } from "@/stores/filters";
import { isFeatureEnabled } from "@/lib/features";
import type { Cinema, Season } from "./types";

/** Active Filter Chips - Shows what's currently filtered */
/** Always renders container to prevent CLS, content only after hydration */
export function ActiveFilterChips({
  cinemas,
  seasons,
  mounted,
}: {
  cinemas: Cinema[];
  seasons: Season[];
  mounted: boolean;
}) {
  const filters = useFilters();

  // Only compute chips after hydration (localStorage not available during SSR)
  const chips: { label: string; onRemove: () => void }[] = [];

  if (mounted) {
    // Film type chip
    if (filters.programmingTypes.length > 0) {
      const type = filters.programmingTypes[0];
      const label = type === "repertory" ? "Repertory" : type === "new_release" ? "New Releases" : type;
      chips.push({
        label,
        onRemove: () => filters.setProgrammingTypes([]),
      });
    }

    // Date chip
    if (filters.dateFrom || filters.dateTo) {
      let label = "Date set";
      if (filters.dateFrom && filters.dateTo && isSameDay(filters.dateFrom, filters.dateTo)) {
        label = format(filters.dateFrom, "EEE d MMM");
      } else if (filters.dateFrom && filters.dateTo) {
        label = `${format(filters.dateFrom, "d MMM")} - ${format(filters.dateTo, "d MMM")}`;
      }
      chips.push({
        label,
        onRemove: () => filters.setDateRange(null, null),
      });
    }

    // Time chip
    if (filters.timeFrom !== null || filters.timeTo !== null) {
      chips.push({
        label: formatTimeRange(filters.timeFrom, filters.timeTo),
        onRemove: () => filters.setTimeRange(null, null),
      });
    }

    // Cinema chip (single chip for all selected cinemas)
    if (filters.cinemaIds.length > 0) {
      const count = filters.cinemaIds.length;
      chips.push({
        label: count === 1
          ? cinemas.find(c => c.id === filters.cinemaIds[0])?.shortName || "1 Cinema"
          : `${count} Cinemas`,
        onRemove: () => filters.setCinemas([]),
      });
    }

    // Format chips (show each selected format)
    if (filters.formats.length > 0) {
      const formatLabels = filters.formats
        .map(f => FORMAT_OPTIONS.find(opt => opt.value === f)?.label || f)
        .join(", ");
      chips.push({
        label: filters.formats.length === 1 ? formatLabels : `${filters.formats.length} Formats`,
        onRemove: () => filters.formats.forEach(f => filters.toggleFormat(f)),
      });
    }

    // Season chip (only when seasons feature is enabled)
    if (filters.seasonSlug && isFeatureEnabled("seasons")) {
      const season = seasons.find(s => s.slug === filters.seasonSlug);
      chips.push({
        label: season?.directorName || season?.name || "Season",
        onRemove: () => filters.clearSeasonFilter(),
      });
    }
  }

  // Always render container with min-height to prevent CLS
  // Height matches one row of chips (28px) + margin (8px)
  if (chips.length === 0) {
    return null; // No chips = no space needed
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2 min-h-[28px]">
      {chips.map((chip, i) => (
        <button
          key={i}
          onClick={chip.onRemove}
          aria-label={`Remove ${chip.label} filter`}
          className="flex items-center gap-1 px-2 py-1 bg-accent-primary/10 text-accent-primary text-xs font-medium rounded-full hover:bg-accent-primary/20 transition-colors"
        >
          <span>{chip.label}</span>
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
