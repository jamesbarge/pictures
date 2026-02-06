/**
 * Mobile Date Picker Modal
 * Full-screen modal for date and time selection on mobile devices
 */

"use client";

import { useState } from "react";
import { X, Calendar, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { format, addDays, startOfToday, isSameDay, isSaturday, isSunday, differenceInDays } from "date-fns";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/cn";
import { useFilters, TIME_PRESETS, formatHour } from "@/stores/filters";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

interface MobileDatePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Helper function to get next weekend
function getNextWeekend(): Date {
  const today = startOfToday();
  const dayOfWeek = today.getDay();
  // Saturday = 6, Sunday = 0
  const daysUntilSaturday = dayOfWeek === 0 ? 6 : dayOfWeek === 6 ? 0 : 6 - dayOfWeek;
  return addDays(today, daysUntilSaturday);
}

export function MobileDatePickerModal({ isOpen, onClose }: MobileDatePickerModalProps) {
  const { dateFrom, dateTo, setDateRange, timeFrom, timeTo, setTimeRange } = useFilters();
  const [showTimeCustom, setShowTimeCustom] = useState(false);

  // Lock body scroll when modal is open
  useBodyScrollLock(isOpen);

  const today = startOfToday();

  // Check which date preset is active
  const isDatePresetActive = (preset: "any" | "today" | "weekend" | "week") => {
    switch (preset) {
      case "any":
        return !dateFrom && !dateTo;
      case "today":
        return dateFrom && isSameDay(dateFrom, today) && dateTo && isSameDay(dateTo, today);
      case "weekend": {
        if (!dateFrom || !dateTo) return false;
        // Check if it's Saturday to Sunday (1 day difference)
        return isSaturday(dateFrom) && isSunday(dateTo) && differenceInDays(dateTo, dateFrom) === 1;
      }
      case "week":
        return dateFrom && isSameDay(dateFrom, today) && dateTo && differenceInDays(dateTo, dateFrom) === 6;
      default:
        return false;
    }
  };

  const handleDatePreset = (preset: "any" | "today" | "weekend" | "week") => {
    switch (preset) {
      case "any":
        setDateRange(null, null);
        break;
      case "today":
        setDateRange(today, today);
        break;
      case "weekend": {
        const weekend = getNextWeekend();
        setDateRange(weekend, addDays(weekend, 1));
        break;
      }
      case "week":
        setDateRange(today, addDays(today, 6));
        break;
    }
  };

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background-secondary animate-in slide-in-from-bottom duration-300">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-background-primary">
        <h2 className="text-lg font-semibold text-text-primary">Select Date & Time</h2>
        <button
          onClick={onClose}
          className="p-2 -mr-2 rounded-lg hover:bg-background-tertiary transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-text-secondary" aria-hidden="true" />
        </button>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Date Section */}
        <section className="px-4 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-text-tertiary" aria-hidden="true" />
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Date</span>
          </div>

          {/* Quick Date Buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => handleDatePreset("any")}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isDatePresetActive("any")
                  ? "bg-accent-primary text-text-inverse"
                  : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
              )}
            >
              Any Date
            </button>
            <button
              onClick={() => handleDatePreset("today")}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isDatePresetActive("today")
                  ? "bg-accent-primary text-text-inverse"
                  : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
              )}
            >
              Today
            </button>
            <button
              onClick={() => handleDatePreset("weekend")}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isDatePresetActive("weekend")
                  ? "bg-accent-primary text-text-inverse"
                  : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
              )}
            >
              Weekend
            </button>
            <button
              onClick={() => handleDatePreset("week")}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isDatePresetActive("week")
                  ? "bg-accent-primary text-text-inverse"
                  : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
              )}
            >
              7 Days
            </button>
          </div>

          {/* Calendar */}
          <div className="bg-background-tertiary rounded-xl p-3">
            <DayPicker
              mode="single"
              weekStartsOn={1}
              selected={dateFrom || undefined}
              onSelect={handleDaySelect}
              defaultMonth={dateFrom || today}
              disabled={{ before: today }}
              showOutsideDays
              classNames={{
                root: "text-text-primary w-full",
                months: "flex flex-col",
                month: "space-y-2",
                month_caption: "flex justify-center relative items-center h-10 mb-2",
                caption_label: "text-base font-medium text-text-primary",
                nav: "flex items-center gap-1",
                button_previous: "absolute left-0 p-2 rounded-lg border border-accent-primary/30 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 hover:border-accent-primary/50 transition-colors",
                button_next: "absolute right-0 p-2 rounded-lg border border-accent-primary/30 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 hover:border-accent-primary/50 transition-colors",
                month_grid: "w-full",
                weekdays: "grid grid-cols-7 gap-1 mb-1",
                weekday: "text-text-tertiary text-sm font-medium h-10 flex items-center justify-center",
                week: "grid grid-cols-7 gap-1",
                day: "h-11 p-0",
                day_button: "w-full h-11 rounded-lg flex items-center justify-center text-base transition-colors hover:bg-background-active text-text-secondary hover:text-text-primary",
                selected: "[&>button]:!bg-accent-primary [&>button]:!text-text-inverse [&>button]:hover:!bg-accent-primary [&>button]:font-medium",
                today: "[&>button]:ring-1 [&>button]:ring-accent-primary/50 [&>button]:text-accent-primary [&>button]:font-medium",
                outside: "[&>button]:text-text-muted [&>button]:opacity-50",
                disabled: "[&>button]:text-text-muted [&>button]:opacity-30 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent",
              }}
              components={{
                Chevron: ({ orientation }) => (
                  orientation === "left"
                    ? <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    : <ChevronRight className="h-5 w-5" aria-hidden="true" />
                ),
              }}
            />
          </div>
        </section>

        {/* Time Section */}
        <section className="px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-text-tertiary" aria-hidden="true" />
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Time</span>
          </div>

          {/* Time Presets */}
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={() => handleTimePreset(null)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
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
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
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
              "mt-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
              showTimeCustom
                ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                : "border-border-default bg-background-secondary text-text-secondary hover:border-border-emphasis hover:text-text-primary"
            )}
          >
            {showTimeCustom ? "Hide custom range" : "Set custom range"}
          </button>

          {/* Custom Time Inputs */}
          {showTimeCustom && (
            <div className="mt-4 flex items-end gap-3">
              <div className="flex-1">
                <label
                  htmlFor="mobile-date-picker-time-from"
                  className="block text-xs text-text-tertiary mb-1.5"
                >
                  From
                </label>
                <select
                  id="mobile-date-picker-time-from"
                  value={timeFrom ?? ""}
                  onChange={(e) => setTimeRange(
                    e.target.value === "" ? null : Number(e.target.value),
                    timeTo
                  )}
                  className="w-full px-3 py-2.5 rounded-lg bg-background-tertiary border border-border-default text-base text-text-primary focus:outline-none focus:border-accent-primary"
                >
                  <option value="">Any</option>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{formatHour(i)}</option>
                  ))}
                </select>
              </div>
              <span className="text-text-tertiary pb-2.5">–</span>
              <div className="flex-1">
                <label
                  htmlFor="mobile-date-picker-time-to"
                  className="block text-xs text-text-tertiary mb-1.5"
                >
                  To
                </label>
                <select
                  id="mobile-date-picker-time-to"
                  value={timeTo ?? ""}
                  onChange={(e) => setTimeRange(
                    timeFrom,
                    e.target.value === "" ? null : Number(e.target.value)
                  )}
                  className="w-full px-3 py-2.5 rounded-lg bg-background-tertiary border border-border-default text-base text-text-primary focus:outline-none focus:border-accent-primary"
                >
                  <option value="">Any</option>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{formatHour(i)}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Sticky Footer */}
      <div className="px-4 py-3 border-t border-border-subtle bg-background-primary safe-area-bottom">
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-accent-primary text-text-inverse font-semibold text-base hover:bg-accent-primary-hover transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
