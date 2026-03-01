"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Calendar, ChevronDown, Clock } from "lucide-react";
import { format, addDays, startOfToday, isSameDay, isSaturday, isSunday, differenceInDays } from "date-fns";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/cn";
import { useFilters, TIME_PRESETS, formatTimeRange, formatHour } from "@/stores/filters";
import { MobileDatePickerModal } from "@/components/filters/mobile-date-picker-modal";
import { getNextWeekend } from "./utils";

/** Date & Time Filter Component */
export function DateTimeFilter({ mounted }: { mounted: boolean; fullWidth?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTimeCustom, setShowTimeCustom] = useState(false);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { dateFrom, dateTo, setDateRange, timeFrom, timeTo, setTimeRange } = useFilters();

  // Check if Weekend preset is active
  const isWeekendActive = () => {
    if (!dateFrom || !dateTo) return false;
    return isSaturday(dateFrom) && isSunday(dateTo) && differenceInDays(dateTo, dateFrom) === 1;
  };

  // Check if 7 Days preset is active
  const is7DaysActive = () => {
    const today = startOfToday();
    if (!dateFrom || !dateTo) return false;
    return isSameDay(dateFrom, today) && differenceInDays(dateTo, dateFrom) === 6;
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const today = startOfToday();

  const displayText = useMemo(() => {
    if (!mounted) return "When";

    const datePart = (() => {
      if (!dateFrom && !dateTo) return null;
      if (dateFrom && dateTo && isSameDay(dateFrom, dateTo)) {
        return format(dateFrom, "EEE d MMM");
      }
      if (dateFrom && dateTo) {
        return `${format(dateFrom, "d MMM")} - ${format(dateTo, "d MMM")}`;
      }
      return null;
    })();

    const timePart = timeFrom !== null || timeTo !== null
      ? formatTimeRange(timeFrom, timeTo)
      : null;

    if (!datePart && !timePart) return "When";
    if (datePart && timePart) return `${datePart}, ${timePart}`;
    return datePart || timePart || "When";
  }, [mounted, dateFrom, dateTo, timeFrom, timeTo]);

  const hasFilter = mounted && (dateFrom || dateTo || timeFrom !== null || timeTo !== null);

  const handleDaySelect = (day: Date | undefined) => {
    if (day) {
      setDateRange(day, day);
    }
  };

  const handleTimePreset = (preset: typeof TIME_PRESETS[number] | null) => {
    if (preset === null) {
      setTimeRange(null, null);
    } else {
      setTimeRange(preset.from, preset.to);
    }
    setShowTimeCustom(false);
  };

  const isTimePresetActive = (preset: typeof TIME_PRESETS[number]) => {
    return timeFrom === preset.from && timeTo === preset.to;
  };

  const handleButtonClick = () => {
    // On mobile (< 640px), open full-screen modal instead of dropdown
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setIsMobileModalOpen(true);
    } else {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleButtonClick}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors min-w-[140px]",
          hasFilter
            ? "bg-accent-primary/10 border-accent-primary/30 text-accent-primary"
            : "bg-background-secondary border-border-default text-text-secondary hover:border-border-emphasis hover:text-text-primary"
        )}
      >
        <Calendar className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left truncate">{displayText}</span>
        <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 w-auto bg-background-secondary border border-border-default rounded-xl shadow-elevated overflow-hidden">
          {/* Date Section */}
          <div className="p-3 border-b border-border-subtle">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-text-tertiary" aria-hidden="true" />
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">Date</span>
            </div>

            {/* Quick Date Options */}
            <div className="flex flex-wrap gap-1 mb-3">
              <button
                onClick={() => setDateRange(null, null)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  !dateFrom && !dateTo
                    ? "bg-accent-primary text-text-inverse"
                    : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
                )}
              >
                Any Date
              </button>
              <button
                onClick={() => setDateRange(today, today)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  dateFrom && isSameDay(dateFrom, today) && dateTo && isSameDay(dateTo, today)
                    ? "bg-accent-primary text-text-inverse"
                    : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
                )}
              >
                Today
              </button>
              <button
                onClick={() => {
                  const weekend = getNextWeekend();
                  setDateRange(weekend, addDays(weekend, 1));
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  isWeekendActive()
                    ? "bg-accent-primary text-text-inverse"
                    : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
                )}
              >
                Weekend
              </button>
              <button
                onClick={() => setDateRange(today, addDays(today, 6))}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  is7DaysActive()
                    ? "bg-accent-primary text-text-inverse"
                    : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
                )}
              >
                7 Days
              </button>
            </div>

            {/* Calendar */}
            <DayPicker
              mode="single"
              weekStartsOn={1}
              selected={dateFrom || undefined}
              onSelect={handleDaySelect}
              defaultMonth={dateFrom || today}
              disabled={{ before: today }}
              showOutsideDays
              classNames={{
                root: "text-text-primary w-[320px] relative",
                months: "flex flex-col",
                month: "space-y-2",
                month_caption: "flex justify-center items-center h-10",
                caption_label: "text-sm font-medium text-text-primary",
                nav: "absolute top-0 left-0 right-0 h-10 flex items-center justify-between px-2 pointer-events-none",
                button_previous: "pointer-events-auto p-1.5 rounded-md bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary transition-colors",
                button_next: "pointer-events-auto p-1.5 rounded-md bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary transition-colors",
                month_grid: "w-full",
                weekdays: "grid grid-cols-7 gap-1 mb-1",
                weekday: "text-text-tertiary text-xs font-medium h-10 flex items-center justify-center",
                week: "grid grid-cols-7 gap-1",
                day: "h-10 p-0",
                day_button: "w-10 h-10 rounded-lg flex items-center justify-center text-sm transition-colors hover:bg-background-active text-text-secondary hover:text-text-primary",
                selected: "[&>button]:!bg-accent-primary [&>button]:!text-text-inverse [&>button]:hover:!bg-accent-primary [&>button]:font-medium",
                today: "[&>button]:ring-1 [&>button]:ring-accent-primary/50 [&>button]:text-accent-primary [&>button]:font-medium",
                outside: "[&>button]:text-text-muted [&>button]:opacity-50",
                disabled: "[&>button]:text-text-muted [&>button]:opacity-30 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent",
              }}
            />
          </div>

          {/* Time Section */}
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-text-tertiary" aria-hidden="true" />
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">Time</span>
            </div>

            {/* Time Presets */}
            <div className="flex flex-wrap gap-1 mb-2">
              <button
                onClick={() => handleTimePreset(null)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  timeFrom === null && timeTo === null
                    ? "bg-accent-primary text-text-inverse"
                    : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
                )}
              >
                Any Time
              </button>
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handleTimePreset(preset)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                    isTimePresetActive(preset)
                      ? "bg-accent-primary text-text-inverse"
                      : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
                  )}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Time Toggle */}
            <button
              onClick={() => setShowTimeCustom(!showTimeCustom)}
              className={cn(
                "mt-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                showTimeCustom
                  ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                  : "border-border-default bg-background-secondary text-text-secondary hover:border-border-emphasis hover:text-text-primary"
              )}
            >
              {showTimeCustom ? "Hide custom range" : "Set custom range"}
            </button>

            {/* Custom Time Inputs */}
            {showTimeCustom && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1">
                  <label htmlFor="time-range-from" className="block text-xs text-text-tertiary mb-1">
                    From
                  </label>
                  <select
                    id="time-range-from"
                    value={timeFrom ?? ""}
                    onChange={(e) => setTimeRange(
                      e.target.value === "" ? null : Number(e.target.value),
                      timeTo
                    )}
                    className="w-full px-2 py-1.5 rounded-lg bg-background-tertiary border border-border-default text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                  >
                    <option value="">Any</option>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{formatHour(i)}</option>
                    ))}
                  </select>
                </div>
                <span className="text-text-tertiary mt-5">–</span>
                <div className="flex-1">
                  <label htmlFor="time-range-to" className="block text-xs text-text-tertiary mb-1">
                    To
                  </label>
                  <select
                    id="time-range-to"
                    value={timeTo ?? ""}
                    onChange={(e) => setTimeRange(
                      timeFrom,
                      e.target.value === "" ? null : Number(e.target.value)
                    )}
                    className="w-full px-2 py-1.5 rounded-lg bg-background-tertiary border border-border-default text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                  >
                    <option value="">Any</option>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{formatHour(i)}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Done Button */}
          {hasFilter && (
            <div className="p-2 border-t border-border-subtle">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-accent-primary text-text-inverse hover:bg-accent-primary-hover transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mobile Full-Screen Modal */}
      <MobileDatePickerModal
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
      />
    </div>
  );
}
