/**
 * Day Section Component
 * Groups screenings by date with a sticky header
 * Supports both screening view (one card per screening) and film view (one card per film)
 */

"use client";

import { useMemo } from "react";
import { format, isToday, isTomorrow, isThisWeek } from "date-fns";
import { ScreeningCard } from "./screening-card";
import { FilmCard } from "./film-card";

interface FilmGroup {
  film: {
    id: string;
    title: string;
    year?: number | null;
    directors: string[];
    posterUrl?: string | null;
  };
  screeningCount: number;
  cinemaCount: number;
  singleCinema?: {
    id: string;
    name: string;
    shortName?: string | null;
  };
  earliestTime: Date;
  hasSpecialFormats: boolean;
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

export function DaySection({ date, screenings, filmGroups, viewMode }: DaySectionProps) {
  const { primary, secondary } = formatDateHeader(date);

  // Memoize sorting to prevent recalculation on every render (for screening view)
  const sortedScreenings = useMemo(
    () =>
      [...screenings].sort(
        (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
      ),
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
              hasSpecialFormats={group.hasSpecialFormats}
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
}
