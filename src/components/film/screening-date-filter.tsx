/**
 * Screening Date Filter Component
 * Horizontal pill selector for filtering by specific dates
 */

"use client";

import { format, isToday, isTomorrow, isSameDay } from "date-fns";
import { cn } from "@/lib/cn";

interface ScreeningDateFilterProps {
  availableDates: Date[];
  selectedDates: Date[] | null;
  onChange: (dates: Date[] | null) => void;
}

function formatDatePill(date: Date): string {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEE d");
}

/** Horizontal date-pill selector for narrowing film screenings to specific days. */
export function ScreeningDateFilter({
  availableDates,
  selectedDates,
  onChange,
}: ScreeningDateFilterProps) {
  // Deduplicate and sort dates
  const uniqueDates = availableDates
    .reduce((acc, date) => {
      if (!acc.some((d) => isSameDay(d, date))) {
        acc.push(date);
      }
      return acc;
    }, [] as Date[])
    .sort((a, b) => a.getTime() - b.getTime());

  // Limit to first 10 dates to avoid overflow
  const displayDates = uniqueDates.slice(0, 10);
  const hasMoreDates = uniqueDates.length > 10;

  const isDateSelected = (date: Date): boolean => {
    if (!selectedDates || selectedDates.length === 0) return false;
    return selectedDates.some((d) => isSameDay(d, date));
  };

  const toggleDate = (date: Date) => {
    if (!selectedDates || selectedDates.length === 0) {
      // First selection
      onChange([date]);
    } else if (isDateSelected(date)) {
      // Remove date
      const newDates = selectedDates.filter((d) => !isSameDay(d, date));
      onChange(newDates.length > 0 ? newDates : null);
    } else {
      // Add date
      onChange([...selectedDates, date]);
    }
  };

  const allSelected = !selectedDates || selectedDates.length === 0;

  return (
    <div className="flex flex-wrap gap-1.5">
      {/* All dates option */}
      <button
        onClick={() => onChange(null)}
        className={cn(
          "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
          allSelected
            ? "bg-accent-primary text-text-inverse"
            : "bg-background-tertiary text-text-secondary hover:bg-surface-overlay-hover hover:text-text-primary"
        )}
      >
        All dates
      </button>

      {/* Individual date pills */}
      {displayDates.map((date, index) => {
        const selected = isDateSelected(date);
        return (
          <button
            key={index}
            onClick={() => toggleDate(date)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              selected
                ? "bg-accent-primary text-text-inverse"
                : "bg-background-tertiary text-text-secondary hover:bg-surface-overlay-hover hover:text-text-primary"
            )}
          >
            {formatDatePill(date)}
          </button>
        );
      })}

      {/* More indicator */}
      {hasMoreDates && (
        <span className="px-2 py-1.5 text-xs text-text-tertiary">
          +{uniqueDates.length - 10} more
        </span>
      )}
    </div>
  );
}
