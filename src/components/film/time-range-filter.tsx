/**
 * Time Range Filter Component
 * Dropdown with presets for filtering screenings by time of day
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { Clock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatHour } from "@/stores/filters";

interface TimeRangeFilterProps {
  timeFrom: number | null;
  timeTo: number | null;
  onChange: (from: number | null, to: number | null) => void;
}

// Time presets matching main filter patterns
const TIME_PRESETS = [
  { label: "Any time", description: null, from: null, to: null },
  { label: "Morning", description: "Before 12pm", from: 0, to: 11 },
  { label: "Afternoon", description: "12pm - 5pm", from: 12, to: 16 },
  { label: "Evening", description: "5pm - 9pm", from: 17, to: 20 },
  { label: "Late Night", description: "After 9pm", from: 21, to: 23 },
] as const;

/** Dropdown with time-of-day presets (morning, afternoon, evening, late night) for screening filters. */
export function TimeRangeFilter({
  timeFrom,
  timeTo,
  onChange,
}: TimeRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasSelection = timeFrom !== null || timeTo !== null;

  // Find matching preset label
  const getDisplayLabel = (): string => {
    if (timeFrom === null && timeTo === null) return "Time";
    const preset = TIME_PRESETS.find(
      (p) => p.from === timeFrom && p.to === timeTo
    );
    if (preset) return preset.label;
    // Custom range
    if (timeFrom !== null && timeTo !== null) {
      return `${formatHour(timeFrom)} - ${formatHour(timeTo + 1)}`;
    }
    if (timeFrom !== null) return `After ${formatHour(timeFrom)}`;
    if (timeTo !== null) return `Before ${formatHour(timeTo + 1)}`;
    return "Time";
  };

  const handlePresetSelect = (from: number | null, to: number | null) => {
    onChange(from, to);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors text-sm whitespace-nowrap",
          hasSelection
            ? "bg-accent-primary/10 border-accent-primary/30 text-accent-primary"
            : "bg-background-secondary border-border-subtle text-text-secondary hover:border-border-default hover:text-text-primary"
        )}
      >
        <Clock className="w-4 h-4" />
        <span>{getDisplayLabel()}</span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 min-w-[180px] bg-background-secondary border border-border-default rounded-xl shadow-elevated overflow-hidden">
          <div className="p-2">
            {TIME_PRESETS.map((preset, index) => {
              const isSelected =
                preset.from === timeFrom && preset.to === timeTo;
              return (
                <button
                  key={index}
                  onClick={() => handlePresetSelect(preset.from, preset.to)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                    isSelected
                      ? "bg-accent-primary/10 text-accent-primary"
                      : "text-text-secondary hover:bg-surface-overlay-hover hover:text-text-primary"
                  )}
                >
                  <div className="font-medium">{preset.label}</div>
                  {preset.description && (
                    <div className="text-xs text-text-tertiary">
                      {preset.description}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
