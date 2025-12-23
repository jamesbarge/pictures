/**
 * Filter Bar Component
 * Power-user friendly horizontal filter bar for desktop
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { X, ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  useFilters,
  FORMAT_OPTIONS,
  DECADES,
  COMMON_GENRES,
  getProgrammingTypeLabel,
  getTimeOfDayLabel,
  type ProgrammingType,
  type TimeOfDay,
} from "@/stores/filters";
import { DateRangePicker } from "./date-range-picker";

export function FilterBar() {
  const filters = useFilters();
  const mounted = useHydrated();

  // Compute activeCount by directly accessing state properties
  // This creates proper Zustand subscriptions so the component re-renders when filters clear
  const activeCount = mounted
    ? (filters.filmSearch.trim() ? 1 : 0) +
      filters.cinemaIds.length +
      (filters.dateFrom || filters.dateTo ? 1 : 0) +
      (filters.timeFrom !== null || filters.timeTo !== null ? 1 : 0) +
      filters.formats.length +
      filters.programmingTypes.length +
      filters.decades.length +
      filters.genres.length +
      filters.timesOfDay.length +
      (filters.hideSeen ? 1 : 0) +
      (filters.hideNotInterested ? 1 : 0)
    : 0;

  return (
    <div className="hidden sm:block border-b border-border-subtle bg-background-primary/80 backdrop-blur-sm">
      <div className="max-w-4xl mx-auto px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date Range Picker */}
          <DateRangePicker />

          {/* Format Filter */}
          <FilterDropdown
            label="Format"
            options={FORMAT_OPTIONS.map((f) => ({ value: f.value, label: f.label }))}
            selected={mounted ? filters.formats : []}
            onToggle={filters.toggleFormat}
          />

          {/* Programming Type */}
          <FilterDropdown
            label="Type"
            options={[
              { value: "repertory", label: "Repertory / Classic" },
              { value: "new_release", label: "New Release" },
              { value: "special_event", label: "Special Event" },
              { value: "preview", label: "Preview / Premiere" },
            ]}
            selected={mounted ? filters.programmingTypes : []}
            onToggle={(v) => filters.toggleProgrammingType(v as ProgrammingType)}
          />

          {/* Decade */}
          <FilterDropdown
            label="Decade"
            options={DECADES.map((d) => ({ value: d, label: d }))}
            selected={mounted ? filters.decades : []}
            onToggle={filters.toggleDecade}
          />

          {/* Genre */}
          <FilterDropdown
            label="Genre"
            options={COMMON_GENRES.map((g) => ({ value: g, label: g }))}
            selected={mounted ? filters.genres : []}
            onToggle={filters.toggleGenre}
          />

          {/* Time of Day */}
          <FilterDropdown
            label="Time"
            options={[
              { value: "morning", label: "Morning (before 12pm)" },
              { value: "afternoon", label: "Afternoon (12-5pm)" },
              { value: "evening", label: "Evening (5-9pm)" },
              { value: "late_night", label: "Late Night (after 9pm)" },
            ]}
            selected={mounted ? filters.timesOfDay : []}
            onToggle={(v) => filters.toggleTimeOfDay(v as TimeOfDay)}
          />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Clear All (only show if there are active filters) */}
          {activeCount > 0 && (
            <button
              onClick={filters.clearAllFilters}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-text-tertiary hover:text-text-primary hover:bg-surface-overlay-hover transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear ({activeCount})
            </button>
          )}
        </div>

        {/* Active Filter Pills */}
        {mounted && activeCount > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-text-tertiary">Active:</span>
            <ActiveFilterPills />
          </div>
        )}
      </div>
    </div>
  );
}

// Reusable Filter Dropdown
interface FilterDropdownProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}

function FilterDropdown({ label, options, selected, onToggle }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasSelection = selected.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors text-sm",
          hasSelection
            ? "bg-accent-primary/10 border-accent-primary/30 text-accent-primary"
            : "bg-background-secondary border-border-subtle text-text-secondary hover:border-border-default hover:text-text-primary"
        )}
      >
        <span>{label}</span>
        {hasSelection && (
          <span className="min-w-[1.25rem] h-5 rounded-full bg-accent-primary/20 text-xs flex items-center justify-center">
            {selected.length}
          </span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 min-w-[200px] bg-background-secondary border border-border-default rounded-xl shadow-elevated overflow-hidden">
          <div className="p-2 max-h-[300px] overflow-y-auto">
            {options.map(({ value, label }) => {
              const isSelected = selected.includes(value);
              return (
                <button
                  key={value}
                  onClick={() => onToggle(value)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                    isSelected
                      ? "bg-accent-primary/10 text-accent-primary"
                      : "text-text-secondary hover:bg-surface-overlay-hover hover:text-text-primary"
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center",
                      isSelected ? "bg-accent-primary border-accent-primary" : "border-border-default"
                    )}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {label}
                </button>
              );
            })}
          </div>

          {selected.length > 0 && (
            <div className="border-t border-border-subtle p-2">
              <button
                onClick={() => {
                  selected.forEach((v) => onToggle(v));
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-text-tertiary hover:bg-surface-overlay-hover hover:text-text-primary transition-colors"
              >
                Clear {label}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Active Filter Pills Display
function ActiveFilterPills() {
  const filters = useFilters();

  const pills: { label: string; onRemove: () => void }[] = [];

  // Date range
  if (filters.dateFrom || filters.dateTo) {
    pills.push({
      label: filters.dateFrom && filters.dateTo
        ? `${filters.dateFrom.toLocaleDateString()} - ${filters.dateTo.toLocaleDateString()}`
        : "Date range",
      onRemove: () => filters.setDateRange(null, null),
    });
  }

  // Formats
  filters.formats.forEach((f) => {
    const option = FORMAT_OPTIONS.find((o) => o.value === f);
    pills.push({
      label: option?.label || f,
      onRemove: () => filters.toggleFormat(f),
    });
  });

  // Programming types
  filters.programmingTypes.forEach((t) => {
    pills.push({
      label: getProgrammingTypeLabel(t),
      onRemove: () => filters.toggleProgrammingType(t),
    });
  });

  // Decades
  filters.decades.forEach((d) => {
    pills.push({
      label: d,
      onRemove: () => filters.toggleDecade(d),
    });
  });

  // Genres
  filters.genres.forEach((g) => {
    pills.push({
      label: g,
      onRemove: () => filters.toggleGenre(g),
    });
  });

  // Times of day
  filters.timesOfDay.forEach((t) => {
    pills.push({
      label: getTimeOfDayLabel(t).split(" ")[0], // Just the time name
      onRemove: () => filters.toggleTimeOfDay(t),
    });
  });

  return (
    <>
      {pills.map((pill, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accent-primary/10 text-accent-primary text-xs"
        >
          {pill.label}
          <button
            onClick={pill.onRemove}
            className="p-0.5 rounded-full hover:bg-accent-primary/20"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </>
  );
}
