/**
 * Day Section Component
 * Groups screenings by date with a sticky header
 */

import { format, isToday, isTomorrow, isThisWeek } from "date-fns";
import { ScreeningCard } from "./screening-card";

interface DaySectionProps {
  date: Date;
  screenings: Array<{
    id: string;
    datetime: Date;
    format?: string | null;
    screen?: string | null;
    eventType?: string | null;
    eventDescription?: string | null;
    bookingUrl: string;
    film: {
      id: string;
      title: string;
      year?: number | null;
      directors: string[];
      posterUrl?: string | null;
      runtime?: number | null;
      isRepertory: boolean;
    };
    cinema: {
      id: string;
      name: string;
      shortName?: string | null;
    };
  }>;
}

function formatDateHeader(date: Date): { primary: string; secondary: string } {
  if (isToday(date)) {
    return {
      primary: "Today",
      secondary: format(date, "EEEE d MMMM"),
    };
  }
  if (isTomorrow(date)) {
    return {
      primary: "Tomorrow",
      secondary: format(date, "EEEE d MMMM"),
    };
  }
  if (isThisWeek(date)) {
    return {
      primary: format(date, "EEEE"),
      secondary: format(date, "d MMMM"),
    };
  }
  return {
    primary: format(date, "EEEE d"),
    secondary: format(date, "MMMM yyyy"),
  };
}

export function DaySection({ date, screenings }: DaySectionProps) {
  const { primary, secondary } = formatDateHeader(date);
  const sortedScreenings = [...screenings].sort(
    (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
  );

  return (
    <section className="relative">
      {/* Sticky Date Header */}
      <header className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-background-primary/95 backdrop-blur-sm border-b border-white/5">
        <div className="flex items-baseline gap-2">
          <h2 className="font-display text-xl sm:text-2xl text-text-primary">
            {primary}
          </h2>
          <span className="text-sm text-text-secondary">{secondary}</span>
          <span className="ml-auto text-sm text-text-tertiary font-mono">
            {screenings.length} {screenings.length === 1 ? "screening" : "screenings"}
          </span>
        </div>
      </header>

      {/* Screenings Grid */}
      <div className="grid gap-3 py-4">
        {sortedScreenings.map((screening) => (
          <ScreeningCard key={screening.id} screening={screening} />
        ))}
      </div>
    </section>
  );
}
