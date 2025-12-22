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
      {/* Sticky Date Header - Full width with subtle gradient */}
      <header className="sticky top-[105px] z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-gradient-to-b from-background-primary via-background-primary to-background-primary/95 backdrop-blur-sm border-b border-white/[0.04]">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-2xl sm:text-3xl text-text-primary tracking-tight">
            {primary}
          </h2>
          <span className="text-sm sm:text-base text-text-secondary font-light">{secondary}</span>
          <span className="ml-auto text-sm text-text-tertiary font-mono tabular-nums">
            {screenings.length} {screenings.length === 1 ? "screening" : "screenings"}
          </span>
        </div>
      </header>

      {/* Screenings Grid - Responsive multi-column layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 py-6">
        {sortedScreenings.map((screening) => (
          <ScreeningCard key={screening.id} screening={screening} />
        ))}
      </div>
    </section>
  );
}
