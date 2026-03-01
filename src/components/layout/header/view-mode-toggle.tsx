"use client";

import { Image, List } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePreferences } from "@/stores/preferences";

/** View Mode Toggle - Posters / Text */
export function ViewModeToggle({ mounted, fullWidth }: { mounted: boolean; fullWidth?: boolean }) {
  const { calendarViewMode, setCalendarViewMode } = usePreferences();

  // Map "films" and "screenings" to "posters", "table" stays as "text"
  const currentMode = mounted
    ? calendarViewMode === "table"
      ? "text"
      : "posters"
    : "posters";

  const handleSelect = (mode: "posters" | "text") => {
    if (mode === "posters") {
      setCalendarViewMode("films");
    } else {
      setCalendarViewMode("table");
    }
  };

  const options = [
    { value: "posters", label: "Posters", icon: Image },
    { value: "text", label: "Text", icon: List },
  ] as const;

  return (
    <div
      role="group"
      aria-label="View mode"
      className={cn(
        "flex rounded-lg border border-border-default bg-background-tertiary overflow-hidden",
        fullWidth && "w-full"
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = currentMode === option.value;
        return (
          <button
            key={option.value}
            onClick={() => handleSelect(option.value)}
            aria-pressed={isActive}
            className={cn(
              "flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
              "border-r border-border-default last:border-r-0",
              fullWidth && "flex-1",
              isActive
                ? "bg-accent-primary text-text-inverse"
                : "text-text-secondary hover:text-text-primary hover:bg-background-hover"
            )}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
