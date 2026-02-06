/**
 * Deadline Picker Component
 * Select the time you need to be free by
 */

"use client";

import { useState, useMemo } from "react";
import { Clock, ChevronDown } from "lucide-react";
import { format, setHours, setMinutes, differenceInMinutes, addDays, isToday, isTomorrow } from "date-fns";
import { cn } from "@/lib/cn";

interface DeadlinePickerProps {
  value: Date | null;
  onChange: (time: Date | null) => void;
}

// Preset times for quick selection
interface TimePreset {
  label: string;
  hour: number;
  minute: number;
  nextDay?: boolean;
}

const PRESETS: TimePreset[] = [
  { label: "6pm", hour: 18, minute: 0 },
  { label: "8pm", hour: 20, minute: 0 },
  { label: "10pm", hour: 22, minute: 0 },
  { label: "Midnight", hour: 0, minute: 0, nextDay: true },
];

export function DeadlinePicker({ value, onChange }: DeadlinePickerProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customHour, setCustomHour] = useState("21");
  const [customMinute, setCustomMinute] = useState("00");

  const now = new Date();

  // Check which preset is currently selected
  const selectedPreset = useMemo(() => {
    if (!value) return null;
    const hour = value.getHours();
    const minute = value.getMinutes();
    return PRESETS.find((p) => {
      const presetHour = p.nextDay === true ? 0 : p.hour;
      return presetHour === hour && p.minute === minute;
    });
  }, [value]);

  // Calculate time remaining
  const timeRemaining = useMemo(() => {
    if (!value) return null;
    const mins = differenceInMinutes(value, now);
    if (mins <= 0) return null;

    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;

    if (hours === 0) return `${remainingMins}m remaining`;
    if (remainingMins === 0) return `${hours}h remaining`;
    return `${hours}h ${remainingMins}m remaining`;
  }, [value, now]);

  // Handle preset selection
  const handlePreset = (preset: TimePreset) => {
    let date = new Date();
    date = setHours(date, preset.hour);
    date = setMinutes(date, preset.minute);
    date.setSeconds(0);
    date.setMilliseconds(0);

    // If the time has passed today, use tomorrow
    if (date <= now || preset.nextDay === true) {
      date = addDays(date, 1);
    }

    onChange(date);
    setShowCustom(false);
  };

  // Handle custom time
  const handleCustomTime = () => {
    const hour = parseInt(customHour, 10);
    const minute = parseInt(customMinute, 10);

    if (isNaN(hour) || isNaN(minute)) return;

    let date = new Date();
    date = setHours(date, hour);
    date = setMinutes(date, minute);
    date.setSeconds(0);
    date.setMilliseconds(0);

    // If the time has passed today, use tomorrow
    if (date <= now) {
      date = addDays(date, 1);
    }

    onChange(date);
    setShowCustom(false);
  };

  // Format selected time for display
  const formatSelectedTime = (date: Date) => {
    const timeStr = format(date, "HH:mm");
    if (isToday(date)) {
      return `Today at ${timeStr}`;
    }
    if (isTomorrow(date)) {
      return `Tomorrow at ${timeStr}`;
    }
    return format(date, "EEE d MMM 'at' HH:mm");
  };

  return (
    <div className="space-y-3">
      {/* Preset Buttons */}
      <div className="flex gap-2 flex-wrap">
        {PRESETS.map((preset) => {
          const isSelected = selectedPreset?.label === preset.label;
          return (
            <button
              key={preset.label}
              onClick={() => handlePreset(preset)}
              className={cn(
                "px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
                isSelected
                  ? "bg-accent-primary text-text-inverse border-accent-primary"
                  : "bg-background-secondary text-text-secondary border-border-default hover:border-accent-primary hover:text-text-primary"
              )}
            >
              {preset.label}
            </button>
          );
        })}

        {/* Custom Button */}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className={cn(
            "px-4 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center gap-1.5",
            showCustom || (!selectedPreset && value)
              ? "bg-accent-primary text-text-inverse border-accent-primary"
              : "bg-background-secondary text-text-secondary border-border-default hover:border-accent-primary hover:text-text-primary"
          )}
        >
          <Clock className="w-4 h-4" />
          Custom
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showCustom && "rotate-180")} />
        </button>
      </div>

      {/* Custom Time Picker */}
      {showCustom && (
        <div className="p-4 bg-background-secondary border border-border-default rounded-lg">
          <div className="flex items-center gap-2">
            <select
              value={customHour}
              onChange={(e) => setCustomHour(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border-default bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i.toString().padStart(2, "0")}>
                  {i.toString().padStart(2, "0")}
                </option>
              ))}
            </select>
            <span className="text-text-secondary text-lg">:</span>
            <select
              value={customMinute}
              onChange={(e) => setCustomMinute(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border-default bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
            >
              {["00", "15", "30", "45"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              onClick={handleCustomTime}
              className="px-4 py-2 rounded-lg bg-accent-primary text-text-inverse text-sm font-medium hover:bg-accent-primary-hover transition-colors"
            >
              Set
            </button>
          </div>
          <p className="text-xs text-text-tertiary mt-2">
            If this time has already passed today, tomorrow will be used.
          </p>
        </div>
      )}

      {/* Selected Time Display */}
      {value && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-primary">
            {formatSelectedTime(value)}
          </span>
          {timeRemaining && (
            <span className="text-accent-primary font-medium">
              {timeRemaining}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
