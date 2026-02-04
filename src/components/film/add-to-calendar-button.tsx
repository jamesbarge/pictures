/**
 * Add to Calendar Button
 * Downloads an .ics file for a screening to add to Google Calendar / Apple Calendar.
 * Part of the "habit loop" retention strategy.
 */

"use client";

import { CalendarPlus } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePostHog } from "posthog-js/react";

interface AddToCalendarButtonProps {
  screeningId: string;
  filmTitle: string;
  cinemaName: string;
  /** Compact mode for inline use */
  compact?: boolean;
  className?: string;
}

export function AddToCalendarButton({
  screeningId,
  filmTitle,
  cinemaName,
  compact = false,
  className,
}: AddToCalendarButtonProps) {
  const posthog = usePostHog();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    posthog.capture("calendar_export_clicked", {
      screening_id: screeningId,
      film_title: filmTitle,
      cinema_name: cinemaName,
    });

    // Trigger download by opening the API URL
    window.open(`/api/calendar?screening=${screeningId}`, "_blank");
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        className={cn(
          "w-7 h-7 flex items-center justify-center rounded-full transition-colors shadow-sm",
          "bg-black/60 text-white/80 hover:bg-accent-primary hover:text-white",
          className
        )}
        aria-label={`Add ${filmTitle} to calendar`}
      >
        <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        "shrink-0 px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5",
        "text-text-secondary bg-background-tertiary hover:bg-surface-overlay-hover border border-border-subtle",
        className
      )}
      aria-label={`Add ${filmTitle} to calendar`}
    >
      <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
      Cal
    </button>
  );
}
