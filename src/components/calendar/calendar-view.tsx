/**
 * Calendar View Component
 * Main container for the screening calendar, groups by date
 */

"use client";

import { useMemo, useState, useEffect } from "react";
import { startOfDay, endOfDay, format, isWithinInterval, getHours } from "date-fns";
import { DaySection } from "./day-section";
import { useFilters, getTimeOfDayFromHour, isIndependentCinema } from "@/stores/filters";
import { useFilmStatus } from "@/stores/film-status";
import { usePreferences } from "@/stores/preferences";
import { useHydrated } from "@/hooks/useHydrated";
import { EmptyState } from "@/components/ui";
import { Button } from "@/components/ui";
import { Film, Search, MapPin } from "lucide-react";
// Map area is now synced to cinemaIds by map-page-client, no direct geo filtering here

// Stable reference for empty set (prevents unnecessary re-renders)
const EMPTY_SET = new Set<string>();

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

interface CinemaWithCoords {
  id: string;
  name: string;
  shortName: string | null;
  coordinates: { lat: number; lng: number } | null;
  chain: string | null;
}

interface CalendarViewProps {
  screenings: Screening[];
  cinemas: CinemaWithCoords[];
}

export function CalendarView({ screenings, cinemas }: CalendarViewProps) {
  const filters = useFilters();
  const { mapArea } = usePreferences();
  const mounted = useHydrated();
  const filmStatusPersist = useFilmStatus.persist;
  const [filmStatusesHydrated, setFilmStatusesHydrated] = useState(
    () => filmStatusPersist?.hasHydrated?.() ?? false
  );

  // Track when film status storage has rehydrated so we can safely apply hide filters without flashing
  useEffect(() => {
    if (!filmStatusPersist?.onFinishHydration) return;
    // Ensure we capture already-hydrated state
    setFilmStatusesHydrated(filmStatusPersist.hasHydrated?.() ?? false);
    const unsub = filmStatusPersist.onFinishHydration(() => {
      setFilmStatusesHydrated(true);
    });
    return unsub;
  }, [filmStatusPersist]);

  // Get hide filter values separately for stable selector
  const hideSeen = filters.hideSeen;
  const hideNotInterested = filters.hideNotInterested;
  const onlySingleShowings = filters.onlySingleShowings;

  // Get all film statuses - only used when hide filters are active
  const allFilmStatuses = useFilmStatus((state) => state.films);

  // Compute hidden film IDs with proper memoization
  const hiddenFilmIds = useMemo(() => {
    // If no hide filters are active, return empty set (stable reference)
    if (!hideSeen && !hideNotInterested) {
      return EMPTY_SET;
    }

    // Build set of film IDs that should be hidden
    const hidden = new Set<string>();
    for (const [filmId, entry] of Object.entries(allFilmStatuses)) {
      if (hideSeen && entry.status === "seen") {
        hidden.add(filmId);
      }
      if (hideNotInterested && entry.status === "not_interested") {
        hidden.add(filmId);
      }
    }
    return hidden;
  }, [allFilmStatuses, hideSeen, hideNotInterested]);

  // Precompute films that appear only once per day across London
  const singleShowingSet = useMemo(() => {
    if (!onlySingleShowings) return null;
    const counts = new Map<string, number>();
    for (const screening of screenings) {
      const dateKey = format(startOfDay(new Date(screening.datetime)), "yyyy-MM-dd");
      const key = `${dateKey}|${screening.film.id}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const singles = new Set<string>();
    for (const [key, count] of counts.entries()) {
      if (count === 1) singles.add(key);
    }
    return singles;
  }, [onlySingleShowings, screenings]);

  // Apply all filters (only after mount)
  const filteredScreenings = useMemo(() => {
    // Before mount, show nothing to avoid flashes; wait for hydration when hide filters rely on user data
    if (!mounted) return [];
    // If personal hide filters are enabled but film statuses haven't rehydrated yet, wait
    if ((hideSeen || hideNotInterested) && !filmStatusesHydrated) return [];

    const now = new Date();

    return screenings.filter((s) => {
      // Filter out past screenings (critical for ISR - server data may be up to 60s stale)
      if (new Date(s.datetime) < now) {
        return false;
      }
      // Film search filter (dynamic text search)
      if (filters.filmSearch.trim()) {
        const searchTerm = filters.filmSearch.toLowerCase();
        const titleMatch = s.film.title.toLowerCase().includes(searchTerm);
        const directorMatch = s.film.directors.some(d => d.toLowerCase().includes(searchTerm));
        if (!titleMatch && !directorMatch) {
          return false;
        }
      }

      // Cinema filter (includes map area selection - cinemaIds is set by map page)
      if (filters.cinemaIds.length > 0 && !filters.cinemaIds.includes(s.cinema.id)) {
        return false;
      }

      // Venue type filter (independent vs chain)
      if (filters.venueType !== "all") {
        const cinema = cinemas.find(c => c.id === s.cinema.id);
        const isIndependent = cinema ? isIndependentCinema(cinema.chain) : true;
        if (filters.venueType === "independent" && !isIndependent) {
          return false;
        }
        if (filters.venueType === "chain" && isIndependent) {
          return false;
        }
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

      // Only single showings per day across London
      if (filters.onlySingleShowings && singleShowingSet) {
        const dateKey = format(startOfDay(new Date(s.datetime)), "yyyy-MM-dd");
        const key = `${dateKey}|${s.film.id}`;
        if (!singleShowingSet.has(key)) {
          return false;
        }
      }

      // Personal status filters (use pre-computed hidden set for performance)
      if (hiddenFilmIds.has(s.film.id)) {
        return false;
      }

      return true;
    });
  }, [screenings, filters, hiddenFilmIds, mounted, cinemas]);

  const activeFilterCount = mounted ? filters.getActiveFilterCount() : 0;

  // Avoid flashing hidden films before film status storage hydrates
  if (!mounted || ((hideSeen || hideNotInterested) && !filmStatusesHydrated)) {
    return (
      <div className="py-8 text-center text-text-tertiary text-sm">
        Loading your filters…
      </div>
    );
  }

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

  // Map filter is active if user drew an area on the map (synced to cinemaIds)
  const hasMapFilter = mounted && mapArea !== null;

  if (filteredScreenings.length === 0) {
    return (
      <CalendarEmptyState
        hasFilters={activeFilterCount > 0}
        hasSearch={!!filters.filmSearch.trim()}
        hasMapFilter={hasMapFilter}
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
  hasMapFilter,
  onClearFilters,
  onClearSearch,
}: {
  hasFilters: boolean;
  hasSearch: boolean;
  hasMapFilter: boolean;
  onClearFilters: () => void;
  onClearSearch: () => void;
}) {
  const { clearMapArea } = usePreferences();

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

  // If map filter is active and no results, show map-specific empty state
  if (hasMapFilter && !hasFilters) {
    return (
      <EmptyState
        icon={<MapPin className="w-10 h-10" />}
        title="No cinemas in your selected area"
        description="Try expanding your map area to include more cinemas."
        action={
          <Button variant="ghost" size="sm" onClick={clearMapArea}>
            Clear map filter
          </Button>
        }
      />
    );
  }

  // If filters active, show filter-specific empty state
  if (hasFilters || hasMapFilter) {
    return (
      <EmptyState
        variant="no-screenings"
        title="No screenings match your filters"
        description={hasMapFilter ? "Try adjusting your filters or expanding your map area." : "Try adjusting your filters to find more screenings."}
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
