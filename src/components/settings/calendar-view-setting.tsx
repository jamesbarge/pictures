/**
 * Calendar View Setting Component
 * Toggle between film view (one card per film) and screening view (one card per screening)
 */

"use client";

import { usePreferences } from "@/stores/preferences";
import { useHydrated } from "@/hooks/useHydrated";
import { cn } from "@/lib/cn";

const VIEW_OPTIONS: {
  value: "films" | "screenings" | "table";
  label: string;
  badge?: string;
  description: string;
}[] = [
  {
    value: "films",
    label: "Film view",
    badge: "(recommended)",
    description: "One card per film per day — easier to browse what's showing",
  },
  {
    value: "screenings",
    label: "Screening view",
    description: "One card per screening — see all showtimes at a glance",
  },
  {
    value: "table",
    label: "Table view",
    description: "Dense text-only list — see all films at a glance, no images",
  },
];

/** Radio group for switching between film, screening, and table calendar view modes. */
export function CalendarViewSetting() {
  const { calendarViewMode, setCalendarViewMode } = usePreferences();
  const mounted = useHydrated();

  // Show loading state before hydration to prevent flash
  if (!mounted) {
    return (
      <div className="space-y-3 animate-pulse">
        {VIEW_OPTIONS.map(({ value }) => (
          <div key={value} className="h-20 rounded-lg bg-background-secondary" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {VIEW_OPTIONS.map(({ value, label, badge, description }) => (
        <label
          key={value}
          htmlFor={`calendar-view-mode-${value}`}
          aria-label={label}
          className={cn(
            "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
            calendarViewMode === value
              ? "border-accent-primary bg-accent-primary/5"
              : "border-border-subtle hover:bg-background-secondary"
          )}
        >
          <input
            id={`calendar-view-mode-${value}`}
            type="radio"
            name="calendarViewMode"
            value={value}
            checked={calendarViewMode === value}
            onChange={() => setCalendarViewMode(value)}
            className="mt-1 accent-accent-primary"
          />
          <div>
            <span className="text-text-primary font-medium">{label}</span>
            {badge && (
              <span className="text-accent-highlight text-xs ml-2">{badge}</span>
            )}
            <p className="text-text-secondary text-sm mt-1">{description}</p>
          </div>
        </label>
      ))}
    </div>
  );
}
