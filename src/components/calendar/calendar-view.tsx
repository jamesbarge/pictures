/**
 * Calendar View Component
 * Main container for the screening calendar, groups by date
 */

"use client";

import { useMemo, useState, useEffect } from "react";
import { startOfDay, endOfDay, format, isWithinInterval, getHours } from "date-fns";
import { DaySection } from "./day-section";
import { useFilters, getTimeOfDayFromHour } from "@/stores/filters";
import { useFilmStatus } from "@/stores/film-status";
import { EmptyState } from "@/components/ui";
import { Button } from "@/components/ui";
import { Film, Search } from "lucide-react";

interface Screening {
  id: string;
  datetime: Date;
  format?: string | null;
  screen?: string | null;
  eventType?: string | null;
  eventDescription?: string | null;
  isSpecialEvent?: boolean;
  bookingUrl: string;
  film: {
    id: string;
    title: string;
    year?: number | null;
    directors: string[];
    posterUrl?: string | null;
    runtime?: number | null;
    isRepertory: boolean;
    genres?: string[];
    decade?: string | null;
  };
  cinema: {
    id: string;
    name: string;
    shortName?: string | null;
  };
}

interface CalendarViewProps {
  screenings: Screening[];
}

export function CalendarView({ screenings }: CalendarViewProps) {
  const filters = useFilters();
  const { getStatus } = useFilmStatus();
  const [mounted, setMounted] = useState(false);

  // Handle hydration - show all screenings until client mounts
  useEffect(() => {
    setMounted(true);
  }, []);

  // Apply all filters (only after mount)
  const filteredScreenings = useMemo(() => {
    // Before mount, show all screenings
    if (!mounted) return screenings;

    return screenings.filter((s) => {
      // Film search filter (dynamic text search)
      if (filters.filmSearch.trim()) {
        const searchTerm = filters.filmSearch.toLowerCase();
        const titleMatch = s.film.title.toLowerCase().includes(searchTerm);
        const directorMatch = s.film.directors.some(d => d.toLowerCase().includes(searchTerm));
        if (!titleMatch && !directorMatch) {
          return false;
        }
      }

      // Cinema filter
      if (filters.cinemaIds.length > 0 && !filters.cinemaIds.includes(s.cinema.id)) {
        return false;
      }

      // Date range filter
      if (filters.dateFrom || filters.dateTo) {
        const screeningDate = new Date(s.datetime);
        if (filters.dateFrom && filters.dateTo) {
          if (!isWithinInterval(screeningDate, {
            start: startOfDay(filters.dateFrom),
            end: endOfDay(filters.dateTo),
          })) {
            return false;
          }
        } else if (filters.dateFrom && screeningDate < startOfDay(filters.dateFrom)) {
          return false;
        } else if (filters.dateTo && screeningDate > endOfDay(filters.dateTo)) {
          return false;
        }
      }

      // Time range filter (hour-based)
      if (filters.timeFrom !== null || filters.timeTo !== null) {
        const hour = getHours(new Date(s.datetime));
        if (filters.timeFrom !== null && hour < filters.timeFrom) {
          return false;
        }
        if (filters.timeTo !== null && hour > filters.timeTo) {
          return false;
        }
      }

      // Format filter
      if (filters.formats.length > 0) {
        if (!s.format || !filters.formats.includes(s.format)) {
          return false;
        }
      }

      // Programming type filter
      if (filters.programmingTypes.length > 0) {
        const isMatch = filters.programmingTypes.some((type) => {
          switch (type) {
            case "repertory":
              return s.film.isRepertory;
            case "new_release":
              return !s.film.isRepertory && !s.isSpecialEvent;
            case "special_event":
              return s.isSpecialEvent || !!s.eventType;
            case "preview":
              return s.eventType === "preview" || s.eventType === "premiere";
            default:
              return false;
          }
        });
        if (!isMatch) return false;
      }

      // Decade filter
      if (filters.decades.length > 0) {
        const filmDecade = s.film.decade || (s.film.year ? getDecadeFromYear(s.film.year) : null);
        if (!filmDecade || !filters.decades.includes(filmDecade)) {
          return false;
        }
      }

      // Genre filter
      if (filters.genres.length > 0) {
        const filmGenres = s.film.genres || [];
        if (!filters.genres.some((g) => filmGenres.includes(g))) {
          return false;
        }
      }

      // Time of day filter
      if (filters.timesOfDay.length > 0) {
        const hour = getHours(new Date(s.datetime));
        const timeOfDay = getTimeOfDayFromHour(hour);
        if (!filters.timesOfDay.includes(timeOfDay)) {
          return false;
        }
      }

      // Personal status filters
      if (filters.hideSeen || filters.hideNotInterested) {
        const status = getStatus(s.film.id);
        if (filters.hideSeen && status === "seen") return false;
        if (filters.hideNotInterested && status === "not_interested") return false;
      }

      return true;
    });
  }, [screenings, filters, getStatus, mounted]);

  const activeFilterCount = mounted ? filters.getActiveFilterCount() : 0;

  // Group screenings by date
  const groupedByDate = useMemo(() => {
    const groups = new Map<string, { date: Date; screenings: Screening[] }>();

    for (const screening of filteredScreenings) {
      const dateKey = format(startOfDay(new Date(screening.datetime)), "yyyy-MM-dd");

      if (!groups.has(dateKey)) {
        groups.set(dateKey, {
          date: startOfDay(new Date(screening.datetime)),
          screenings: [],
        });
      }
      groups.get(dateKey)!.screenings.push(screening);
    }

    // Sort by date
    return Array.from(groups.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
  }, [filteredScreenings]);

  if (filteredScreenings.length === 0) {
    return (
      <CalendarEmptyState
        hasFilters={activeFilterCount > 0}
        hasSearch={!!filters.filmSearch.trim()}
        onClearFilters={filters.clearAllFilters}
        onClearSearch={() => filters.setFilmSearch("")}
      />
    );
  }

  return (
    <div className="space-y-2">
      {groupedByDate.map(({ date, screenings }) => (
        <DaySection
          key={format(date, "yyyy-MM-dd")}
          date={date}
          screenings={screenings}
        />
      ))}
    </div>
  );
}

function CalendarEmptyState({
  hasFilters,
  hasSearch,
  onClearFilters,
  onClearSearch,
}: {
  hasFilters: boolean;
  hasSearch: boolean;
  onClearFilters: () => void;
  onClearSearch: () => void;
}) {
  // If searching, show search-specific empty state
  if (hasSearch) {
    return (
      <EmptyState
        icon={<Search className="w-10 h-10" />}
        title="No films match your search"
        description="Try a different search term or check your spelling."
        action={
          <Button variant="ghost" size="sm" onClick={onClearSearch}>
            Clear search
          </Button>
        }
      />
    );
  }

  // If filters active, show filter-specific empty state
  if (hasFilters) {
    return (
      <EmptyState
        variant="no-screenings"
        title="No screenings match your filters"
        description="Try adjusting your filters to find more screenings."
        action={
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            Clear all filters
          </Button>
        }
      />
    );
  }

  // Default empty state
  return (
    <EmptyState
      icon={<Film className="w-10 h-10" />}
      title="No screenings available"
      description="Check back later for new listings from London cinemas."
    />
  );
}

// Helper function to get decade from year
function getDecadeFromYear(year: number): string {
  if (year < 1950) return "Pre-1950";
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}
