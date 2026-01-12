/**
 * Date Range Picker Component
 * Calendar-based date selection using react-day-picker
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { DayPicker, DateRange } from "react-day-picker";
import { format, startOfDay, addDays, isSameDay, isToday, isTomorrow } from "date-fns";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFilters } from "@/stores/filters";

interface DateRangePickerProps {
  className?: string;
}

export function DateRangePicker({ className }: DateRangePickerProps) {
  const { dateFrom, dateTo, setDateRange } = useFilters();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(() => typeof window !== "undefined");
  const containerRef = useRef<HTMLDivElement>(null);

  // Ensure mounted updates after hydration
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Standard hydration pattern
    if (!mounted) setMounted(true);
  }, [mounted]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleRangeSelect = (range: DateRange | undefined) => {
    setDateRange(range?.from || null, range?.to || null);
  };

  const handleQuickSelect = (preset: "today" | "tomorrow" | "week" | "weekend") => {
    const today = startOfDay(new Date());

    switch (preset) {
      case "today":
        setDateRange(today, today);
        break;
      case "tomorrow":
        const tomorrow = addDays(today, 1);
        setDateRange(tomorrow, tomorrow);
        break;
      case "week":
        setDateRange(today, addDays(today, 6));
        break;
      case "weekend":
        // Find next Saturday
        const daysUntilSaturday = (6 - today.getDay() + 7) % 7 || 7;
        const saturday = addDays(today, today.getDay() === 6 ? 0 : daysUntilSaturday);
        const sunday = addDays(saturday, 1);
        setDateRange(saturday, sunday);
        break;
    }
    setIsOpen(false);
  };

  const clearDateRange = () => {
    setDateRange(null, null);
  };

  // Format the button label
  const getButtonLabel = () => {
    if (!mounted) return "All Dates";
    if (!dateFrom && !dateTo) return "All Dates";

    if (dateFrom && dateTo) {
      if (isSameDay(dateFrom, dateTo)) {
        if (isToday(dateFrom)) return "Today";
        if (isTomorrow(dateFrom)) return "Tomorrow";
        return format(dateFrom, "d MMM");
      }
      return `${format(dateFrom, "d MMM")} – ${format(dateTo, "d MMM")}`;
    }

    if (dateFrom) {
      return `From ${format(dateFrom, "d MMM")}`;
    }

    return "All Dates";
  };

  const hasSelection = mounted && (dateFrom || dateTo);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm",
          hasSelection
            ? "bg-accent-primary/10 border-accent-primary/30 text-accent-primary"
            : "bg-background-secondary border-border-subtle text-text-secondary hover:border-border-default hover:text-text-primary"
        )}
      >
        <Calendar className="w-4 h-4" />
        <span>{getButtonLabel()}</span>
        {hasSelection && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              clearDateRange();
            }}
            className="ml-1 p-0.5 rounded hover:bg-accent-primary/20"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-background-secondary border border-border-default rounded-xl shadow-elevated overflow-hidden">
          <div className="flex">
            {/* Quick Presets */}
            <div className="w-32 border-r border-border-subtle py-3 px-2">
              <p className="text-xs text-text-tertiary uppercase tracking-wider px-2 mb-2">
                Quick Select
              </p>
              {[
                { key: "today", label: "Today" },
                { key: "tomorrow", label: "Tomorrow" },
                { key: "week", label: "This Week" },
                { key: "weekend", label: "Weekend" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handleQuickSelect(key as "today" | "tomorrow" | "week" | "weekend")}
                  className="w-full text-left px-2 py-1.5 rounded text-sm text-text-secondary hover:bg-surface-overlay-hover hover:text-text-primary transition-colors"
                >
                  {label}
                </button>
              ))}
              <div className="my-2 border-t border-border-subtle" />
              <button
                onClick={() => {
                  clearDateRange();
                  setIsOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded text-sm text-text-tertiary hover:bg-surface-overlay-hover hover:text-text-primary transition-colors"
              >
                All Dates
              </button>
            </div>

            {/* Calendar */}
            <div className="p-4">
              <DayPicker
                mode="range"
                weekStartsOn={1}
                selected={{ from: dateFrom || undefined, to: dateTo || undefined }}
                onSelect={handleRangeSelect}
                numberOfMonths={1}
                disabled={{ before: new Date() }}
                showOutsideDays
                classNames={{
                  root: "text-text-primary",
                  months: "flex gap-4",
                  month: "space-y-4",
                  caption: "flex justify-center pt-1 relative items-center",
                  caption_label: "text-sm font-medium",
                  nav: "flex items-center gap-1",
                  nav_button: "h-8 w-8 p-1.5 rounded-lg border border-accent-primary/30 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 hover:border-accent-primary/50 transition-all flex items-center justify-center",
                  nav_button_previous: "absolute left-0",
                  nav_button_next: "absolute right-0",
                  table: "w-full border-collapse",
                  head_row: "flex",
                  head_cell: "text-text-tertiary rounded-md w-8 font-normal text-[0.8rem]",
                  row: "flex w-full mt-1",
                  cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
                  day: "h-8 w-8 p-0 font-normal rounded-md hover:bg-surface-overlay-hover flex items-center justify-center transition-colors",
                  day_range_start: "bg-accent-primary text-text-inverse hover:bg-accent-primary rounded-l-md rounded-r-none",
                  day_range_end: "bg-accent-primary text-text-inverse hover:bg-accent-primary rounded-r-md rounded-l-none",
                  day_selected: "bg-accent-primary text-text-inverse hover:bg-accent-primary",
                  day_today: "border border-accent-primary/50",
                  day_outside: "opacity-30",
                  day_disabled: "opacity-30 cursor-not-allowed",
                  day_range_middle: "bg-accent-primary/20 rounded-none",
                  day_hidden: "invisible",
                }}
                components={{
                  Chevron: ({ orientation }) => (
                    orientation === "left"
                      ? <ChevronLeft className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />
                  ),
                }}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border-subtle px-4 py-2 flex justify-end">
            <button
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 rounded-lg text-sm bg-accent-primary text-text-inverse hover:bg-accent-hover transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
