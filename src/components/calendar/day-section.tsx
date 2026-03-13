/**
 * Day Section Component
 * Groups screenings by date with a sticky header
 * Supports both screening view (one card per screening) and film view (one card per film)
 */

"use client";

import { useMemo, memo } from "react";
import { format } from "date-fns";
import { ScreeningCard } from "./screening-card";
import { FilmCard } from "./film-card";
import { useSafeDateLabels } from "@/hooks/useSafeDateLabels";

interface FilmGroup {
  film: {
    id: string;
    title: string;
    year?: number | null;
    directors: string[];
    posterUrl?: string | null;
    isRepertory?: boolean;
  };
  screeningCount: number;
  cinemaCount: number;
  singleCinema?: {
    id: string;
    name: string;
    shortName?: string | null;
  };
  earliestTime: Date;
  specialFormats: string[];
}

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
      letterboxdRating?: number | null;
    };
    cinema: {
      id: string;
      name: string;
      shortName?: string | null;
    };
  }>;
  filmGroups?: FilmGroup[];
  viewMode: "films" | "screenings";
}

interface DateCheckFns {
  isToday: (date: Date) => boolean;
  isTomorrow: (date: Date) => boolean;
  isThisWeek: (date: Date) => boolean;
}

function formatDateHeader(
  date: Date,
  checks: DateCheckFns
): { primary: string; secondary: string } {
  if (checks.isToday(date)) {
    return {
      primary: "Today",
      secondary: format(date, "EEEE d MMMM"),
    };
  }
  if (checks.isTomorrow(date)) {
    return {
      primary: "Tomorrow",
      secondary: format(date, "EEEE d MMMM"),
    };
  }
  if (checks.isThisWeek(date)) {
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

/** Memoized day group with sticky date header, rendering screening or film cards by view mode. */
export const DaySection = memo(function DaySection({ date, screenings, filmGroups, viewMode }: DaySectionProps) {
  const { isClientToday, isClientTomorrow, isClientThisWeek } = useSafeDateLabels();

  const { primary, secondary } = formatDateHeader(date, {
    isToday: isClientToday,
    isTomorrow: isClientTomorrow,
    isThisWeek: isClientThisWeek,
  });

  // Memoize sorting to prevent recalculation on every render (for screening view)
  // Primary sort: Letterboxd rating (descending), Secondary: time (ascending)
  const sortedScreenings = useMemo(
    () =>
      [...screenings].sort((a, b) => {
        // Primary sort: by Letterboxd rating (higher first, nulls last)
        const aRating = a.film.letterboxdRating ?? 0;
        const bRating = b.film.letterboxdRating ?? 0;
        if (aRating !== bRating) {
          return bRating - aRating; // Descending (higher rating first)
        }
        // Secondary sort: by time (earlier first)
        const aTime = (a as typeof a & { _parsedDatetime?: Date })._parsedDatetime?.getTime()
          ?? new Date(a.datetime).getTime();
        const bTime = (b as typeof b & { _parsedDatetime?: Date })._parsedDatetime?.getTime()
          ?? new Date(b.datetime).getTime();
        return aTime - bTime;
      }),
    [screenings]
  );

  // Determine count label based on view mode
  const isFilmView = viewMode === "films" && filmGroups;
  const count = isFilmView ? filmGroups.length : screenings.length;
  const countLabel = isFilmView
    ? `${count} ${count === 1 ? "film" : "films"}`
    : `${count} ${count === 1 ? "screening" : "screenings"}`;

  return (
    <section className="relative">
      {/* Sticky Date Header - Full width with solid background for light theme */}
      <header className="sticky top-[105px] z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-background-primary border-b border-border-subtle">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-2xl sm:text-3xl text-text-primary tracking-tight">
            {primary}
          </h2>
          <span className="text-sm sm:text-base text-text-secondary font-light">{secondary}</span>
          <span className="ml-auto text-sm text-text-tertiary font-mono tabular-nums">
            {countLabel}
          </span>
        </div>
      </header>

      {/* Grid - Compact Letterboxd-style layout */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 py-6">
        {isFilmView ? (
          // Film view: render FilmCard components
          filmGroups.map((group) => (
            <FilmCard
              key={group.film.id}
              film={group.film}
              screeningCount={group.screeningCount}
              cinemaCount={group.cinemaCount}
              singleCinema={group.singleCinema}
              earliestTime={group.earliestTime}
              specialFormats={group.specialFormats}
            />
          ))
        ) : (
          // Screening view: render ScreeningCard components
          sortedScreenings.map((screening) => (
            <ScreeningCard key={screening.id} screening={screening} />
          ))
        )}
      </div>
    </section>
  );
});
