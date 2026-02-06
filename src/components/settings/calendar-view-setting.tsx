/**
 * Calendar View Setting Component
 * Toggle between film view (one card per film) and screening view (one card per screening)
 */

"use client";

import { usePreferences } from "@/stores/preferences";
import { useHydrated } from "@/hooks/useHydrated";
import { cn } from "@/lib/cn";

export function CalendarViewSetting() {
  const { calendarViewMode, setCalendarViewMode } = usePreferences();
  const mounted = useHydrated();

  // Show loading state before hydration to prevent flash
  if (!mounted) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-20 rounded-lg bg-background-secondary" />
        <div className="h-20 rounded-lg bg-background-secondary" />
        <div className="h-20 rounded-lg bg-background-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor="calendar-view-mode-films"
        aria-label="Film view"
        className={cn(
          "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
          calendarViewMode === "films"
            ? "border-accent-primary bg-accent-primary/5"
            : "border-border-subtle hover:bg-background-secondary"
        )}
      >
        <input
          id="calendar-view-mode-films"
          type="radio"
          name="calendarViewMode"
          value="films"
          checked={calendarViewMode === "films"}
          onChange={() => setCalendarViewMode("films")}
          className="mt-1 accent-accent-primary"
        />
        <div>
          <span className="text-text-primary font-medium">Film view</span>
          <span className="text-accent-highlight text-xs ml-2">(recommended)</span>
          <p className="text-text-secondary text-sm mt-1">
            One card per film per day — easier to browse what&apos;s showing
          </p>
        </div>
      </label>

      <label
        htmlFor="calendar-view-mode-screenings"
        aria-label="Screening view"
        className={cn(
          "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
          calendarViewMode === "screenings"
            ? "border-accent-primary bg-accent-primary/5"
            : "border-border-subtle hover:bg-background-secondary"
        )}
      >
        <input
          id="calendar-view-mode-screenings"
          type="radio"
          name="calendarViewMode"
          value="screenings"
          checked={calendarViewMode === "screenings"}
          onChange={() => setCalendarViewMode("screenings")}
          className="mt-1 accent-accent-primary"
        />
        <div>
          <span className="text-text-primary font-medium">Screening view</span>
          <p className="text-text-secondary text-sm mt-1">
            One card per screening — see all showtimes at a glance
          </p>
        </div>
      </label>

      <label
        htmlFor="calendar-view-mode-table"
        aria-label="Table view"
        className={cn(
          "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
          calendarViewMode === "table"
            ? "border-accent-primary bg-accent-primary/5"
            : "border-border-subtle hover:bg-background-secondary"
        )}
      >
        <input
          id="calendar-view-mode-table"
          type="radio"
          name="calendarViewMode"
          value="table"
          checked={calendarViewMode === "table"}
          onChange={() => setCalendarViewMode("table")}
          className="mt-1 accent-accent-primary"
        />
        <div>
          <span className="text-text-primary font-medium">Table view</span>
          <p className="text-text-secondary text-sm mt-1">
            Dense text-only list — see all films at a glance, no images
          </p>
        </div>
      </label>
    </div>
  );
}
