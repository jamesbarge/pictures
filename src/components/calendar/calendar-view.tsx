/**
 * Calendar View Component
 * Main container for the screening calendar, groups by date
 */

"use client";

import { useMemo, useState, useEffect } from "react";
import { startOfDay, endOfDay, format, isWithinInterval, getHours } from "date-fns";
import { DaySection } from "./day-section";
import { TableView } from "./table-view";
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
    letterboxdRating?: number | null;
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

// Film group structure for film view mode
interface FilmGroup {
  film: {
    id: string;
    title: string;
    year?: number | null;
    directors: string[];
    posterUrl?: string | null;
    letterboxdRating?: number | null;
    isRepertory?: boolean;
  };
  screeningCount: number;
  cinemaCount: number;
  // When there's only one cinema, include its info for display
  singleCinema?: {
    id: string;
    name: string;
    shortName?: string | null;
  };
  earliestTime: Date;
  specialFormats: string[];
}

export function CalendarView({ screenings }: CalendarViewProps) {
  const filters = useFilters();
  const { mapArea, calendarViewMode } = usePreferences();
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

  // Pre-parse datetimes once to avoid repeated Date construction in filter pipeline
  // This is a significant performance optimization - parsing happens once instead of 5-8 times per screening
  const parsedScreenings = useMemo(() => {
    return screenings.map((s) => {
      const dt = new Date(s.datetime);
      return {
        ...s,
        _parsedDatetime: dt,
        _hour: getHours(dt),
        _dateKey: format(startOfDay(dt), "yyyy-MM-dd"),
      };
    });
  }, [screenings]);

  // Precompute films that appear only once per day across London
  const singleShowingSet = useMemo(() => {
    if (!onlySingleShowings) return null;
    const counts = new Map<string, number>();
    for (const screening of parsedScreenings) {
      const key = `${screening._dateKey}|${screening.film.id}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const singles = new Set<string>();
    for (const [key, count] of counts.entries()) {
      if (count === 1) singles.add(key);
    }
    return singles;
  }, [onlySingleShowings, parsedScreenings]);

  // Apply all filters using pre-parsed datetime values (only after mount)
  const filteredScreenings = useMemo(() => {
    // Before mount, show nothing to avoid flashes; wait for hydration when hide filters rely on user data
    if (!mounted) return [];
    // If personal hide filters are enabled but film statuses haven't rehydrated yet, wait
    if ((hideSeen || hideNotInterested) && !filmStatusesHydrated) return [];

    const now = new Date();

    return parsedScreenings.filter((s) => {
      // Filter out past screenings (critical for ISR - server data may be up to 60s stale)
      // Uses pre-parsed datetime to avoid repeated Date construction
      if (s._parsedDatetime < now) {
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

      // Date range filter - uses pre-parsed datetime
      if (filters.dateFrom || filters.dateTo) {
        if (filters.dateFrom && filters.dateTo) {
          if (!isWithinInterval(s._parsedDatetime, {
            start: startOfDay(filters.dateFrom),
            end: endOfDay(filters.dateTo),
          })) {
            return false;
          }
        } else if (filters.dateFrom && s._parsedDatetime < startOfDay(filters.dateFrom)) {
          return false;
        } else if (filters.dateTo && s._parsedDatetime > endOfDay(filters.dateTo)) {
          return false;
        }
      }

      // Time range filter - uses pre-parsed hour
      if (filters.timeFrom !== null || filters.timeTo !== null) {
        if (filters.timeFrom !== null && s._hour < filters.timeFrom) {
          return false;
        }
        if (filters.timeTo !== null && s._hour > filters.timeTo) {
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

      // Time of day filter - uses pre-parsed hour
      if (filters.timesOfDay.length > 0) {
        const timeOfDay = getTimeOfDayFromHour(s._hour);
        if (!filters.timesOfDay.includes(timeOfDay)) {
          return false;
        }
      }

      // Only single showings per day across London - uses pre-parsed dateKey
      if (filters.onlySingleShowings && singleShowingSet) {
        const key = `${s._dateKey}|${s.film.id}`;
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
  }, [parsedScreenings, filters, hiddenFilmIds, mounted, singleShowingSet, hideSeen, hideNotInterested, filmStatusesHydrated]);

  const activeFilterCount = mounted ? filters.getActiveFilterCount() : 0;

  // Group screenings by date - uses pre-parsed dateKey for performance
  const groupedByDate = useMemo(() => {
    const groups = new Map<string, { date: Date; screenings: Screening[] }>();

    for (const screening of filteredScreenings) {
      // Use pre-parsed dateKey to avoid Date construction
      const dateKey = screening._dateKey;

      if (!groups.has(dateKey)) {
        groups.set(dateKey, {
          date: startOfDay(screening._parsedDatetime),
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

  // Group screenings by film within each date (for film view mode)
  const groupedByDateThenFilm = useMemo(() => {
    if (calendarViewMode !== "films") return null;

    return groupedByDate.map(({ date, screenings }) => {
      // Group by film.id
      const filmMap = new Map<string, { film: Screening["film"]; screenings: Screening[] }>();
      for (const screening of screenings) {
        if (!filmMap.has(screening.film.id)) {
          filmMap.set(screening.film.id, {
            film: screening.film,
            screenings: [],
          });
        }
        filmMap.get(screening.film.id)!.screenings.push(screening);
      }

      // Compute film groups with counts - uses pre-parsed datetime for performance
      const filmGroups: FilmGroup[] = Array.from(filmMap.values()).map((g) => {
        const uniqueCinemas = new Map(g.screenings.map((s) => [s.cinema.id, s.cinema]));
        const cinemaCount = uniqueCinemas.size;
        // If only one cinema, include its info for display
        const singleCinema = cinemaCount === 1
          ? {
              id: g.screenings[0].cinema.id,
              name: g.screenings[0].cinema.name,
              shortName: g.screenings[0].cinema.shortName,
            }
          : undefined;

        // Collect unique special formats with normalized display names
        const formatSet = new Set<string>();
        for (const s of g.screenings) {
          const fmt = s.format?.toLowerCase() || "";
          if (fmt.includes("70mm")) formatSet.add("70mm");
          else if (fmt.includes("35mm")) formatSet.add("35mm");
          else if (fmt.includes("imax")) formatSet.add("IMAX");
          else if (fmt.includes("4k")) formatSet.add("4K");
        }

        return {
          film: {
            id: g.film.id,
            title: g.film.title,
            year: g.film.year,
            directors: g.film.directors,
            posterUrl: g.film.posterUrl,
            letterboxdRating: g.film.letterboxdRating,
            isRepertory: g.film.isRepertory,
          },
          screeningCount: g.screenings.length,
          cinemaCount,
          singleCinema,
          // Use pre-parsed datetime to avoid repeated Date construction
          earliestTime: new Date(
            Math.min(...g.screenings.map((s) => (s as typeof s & { _parsedDatetime: Date })._parsedDatetime.getTime()))
          ),
          specialFormats: Array.from(formatSet),
        };
      });

      // Sort by Letterboxd rating (descending), then earliest screening time
      filmGroups.sort((a, b) => {
        const aRating = a.film.letterboxdRating ?? 0;
        const bRating = b.film.letterboxdRating ?? 0;
        if (aRating !== bRating) {
          return bRating - aRating; // Higher rating first
        }
        return a.earliestTime.getTime() - b.earliestTime.getTime();
      });

      return { date, screenings, filmGroups };
    });
  }, [groupedByDate, calendarViewMode]);

  // Map filter is active if user drew an area on the map (synced to cinemaIds)
  const hasMapFilter = mounted && mapArea !== null;

  // Avoid flashing hidden films before film status storage hydrates
  // Must be AFTER all useMemo hooks (React hooks rules)
  if (!mounted || ((hideSeen || hideNotInterested) && !filmStatusesHydrated)) {
    return (
      <div className="py-8 text-center text-text-tertiary text-sm">
        Loading your filters…
      </div>
    );
  }

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

  // Table view gets all filtered screenings as a flat list
  if (calendarViewMode === "table") {
    return <TableView screenings={filteredScreenings} />;
  }

  // Choose data source based on view mode (films vs screenings)
  const displayData = calendarViewMode === "films" && groupedByDateThenFilm
    ? groupedByDateThenFilm
    : groupedByDate.map(g => ({ ...g, filmGroups: undefined }));

  return (
    <div className="space-y-2">
      {displayData.map(({ date, screenings, filmGroups }) => (
        <DaySection
          key={format(date, "yyyy-MM-dd")}
          date={date}
          screenings={screenings}
          filmGroups={filmGroups}
          viewMode={calendarViewMode}
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
        icon={<Search className="w-10 h-10" aria-hidden="true" />}
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
        icon={<MapPin className="w-10 h-10" aria-hidden="true" />}
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
      icon={<Film className="w-10 h-10" aria-hidden="true" />}
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
