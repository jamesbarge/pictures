/**
 * Film Screenings Component
 * Shows upcoming screenings for a film, grouped by cinema
 * Includes filters for cinema search, time range, and date selection
 *
 * IMPORTANT: Reads initial filter values from global store to persist
 * filters applied on homepage when navigating to film detail.
 */

"use client";

import { useState, useMemo, useEffect } from "react";
import { format, isToday, isTomorrow, isSameDay, getHours, startOfDay, isWithinInterval, startOfHour, endOfDay } from "date-fns";
import { MapPin, ExternalLink, Search, Filter } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePostHog } from "posthog-js/react";
import { ScreeningFilters, type FilmScreeningFilters } from "./screening-filters";
import { EmptyState } from "@/components/ui";
import { useFilters } from "@/stores/filters";

interface Screening {
  id: string;
  datetime: Date;
  format?: string | null;
  screen?: string | null;
  eventType?: string | null;
  bookingUrl: string;
  cinema: {
    id: string;
    name: string;
    shortName?: string | null;
    address?: {
      area?: string;
    } | null;
  };
}

interface FilmScreeningsProps {
  screenings: Screening[];
  film: {
    id: string;
    title: string;
  };
}

const formatBadgeColors: Record<string, string> = {
  "35mm": "bg-format-35mm/20 text-format-35mm border-format-35mm/50",
  "70mm": "bg-format-70mm/20 text-format-70mm border-format-70mm/50",
  imax: "bg-format-imax/20 text-format-imax border-format-imax/50",
  "4k": "bg-format-4k/20 text-format-4k border-format-4k/50",
};

const eventTypeBadges: Record<string, { label: string; className: string }> = {
  q_and_a: { label: "Q&A", className: "bg-accent-highlight/20 text-accent-highlight-dark" },
  intro: { label: "Intro", className: "bg-accent-success/20 text-accent-success" },
  discussion: { label: "Discussion", className: "bg-accent-primary/20 text-accent-primary" },
};

function formatScreeningDate(date: Date): string {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEE d MMM");
}

// Threshold: show filters when there are enough screenings to warrant filtering
const FILTER_THRESHOLD = 5;

export function FilmScreenings({ screenings, film }: FilmScreeningsProps) {
  const posthog = usePostHog();

  // Read global filters from homepage
  const globalFilters = useFilters();

  // Local filter state - initialized from global filters for persistence
  const [filters, setFilters] = useState<FilmScreeningFilters>({
    cinemaSearch: "",
    timeFrom: globalFilters.timeFrom,
    timeTo: globalFilters.timeTo,
    selectedDates: null,
  });

  // Initialize date filter from global date range
  // This runs once when component mounts and converts dateFrom/dateTo to selectedDates
  const [hasInitializedDates, setHasInitializedDates] = useState(false);
  useEffect(() => {
    if (!hasInitializedDates && (globalFilters.dateFrom || globalFilters.dateTo)) {
      // Get available dates for this film
      const filmDates = screenings.map((s) => startOfDay(new Date(s.datetime)));
      const uniqueDates = Array.from(
        new Set(filmDates.map((d) => d.getTime()))
      ).map((t) => new Date(t));

      // Filter to dates within the global range
      const datesInRange = uniqueDates.filter((date) => {
        if (globalFilters.dateFrom && date < startOfDay(globalFilters.dateFrom)) return false;
        if (globalFilters.dateTo && date > endOfDay(globalFilters.dateTo)) return false;
        return true;
      });

      if (datesInRange.length > 0 && datesInRange.length < uniqueDates.length) {
        // Only set filter if it actually restricts the dates
        setFilters((prev) => ({ ...prev, selectedDates: datesInRange }));
      }
      setHasInitializedDates(true);
    }
  }, [hasInitializedDates, globalFilters.dateFrom, globalFilters.dateTo, screenings]);

  // Track if user wants to ignore global filters on this page
  const [ignoreGlobalFilters, setIgnoreGlobalFilters] = useState(false);

  // Check if any global filters are set (for showing the indicator)
  const hasGlobalFiltersSet = useMemo(() => {
    return globalFilters.cinemaIds.length > 0 || globalFilters.formats.length > 0;
  }, [globalFilters.cinemaIds, globalFilters.formats]);

  const trackBookingClick = (screening: Screening) => {
    posthog.capture("booking_link_clicked", {
      film_id: film.id,
      film_title: film.title,
      screening_id: screening.id,
      screening_time: screening.datetime,
      cinema_id: screening.cinema.id,
      cinema_name: screening.cinema.name,
      format: screening.format,
      event_type: screening.eventType,
      booking_url: screening.bookingUrl,
    });
  };

  // Track filter usage
  const trackFilterChange = (filterType: string, value: unknown) => {
    posthog.capture("film_screening_filter_changed", {
      film_id: film.id,
      filter_type: filterType,
      value,
    });
  };

  const handleFiltersChange = (newFilters: FilmScreeningFilters) => {
    // Track which filter changed
    if (newFilters.cinemaSearch !== filters.cinemaSearch) {
      trackFilterChange("cinema_search", newFilters.cinemaSearch);
    }
    if (newFilters.timeFrom !== filters.timeFrom || newFilters.timeTo !== filters.timeTo) {
      trackFilterChange("time_range", { from: newFilters.timeFrom, to: newFilters.timeTo });
    }
    if (newFilters.selectedDates !== filters.selectedDates) {
      trackFilterChange("date_filter", newFilters.selectedDates?.length ?? 0);
    }
    setFilters(newFilters);
  };

  // Extract available dates from screenings (for date filter)
  const availableDates = useMemo(() => {
    return screenings.map((s) => startOfDay(new Date(s.datetime)));
  }, [screenings]);

  // Apply filters (both global from homepage and local from this page)
  const filteredScreenings = useMemo(() => {
    return screenings.filter((screening) => {
      // GLOBAL FILTER: Cinema IDs from homepage
      // If user selected specific cinemas on homepage, only show those
      // (unless user clicked "Show all" to ignore global filters)
      if (!ignoreGlobalFilters && globalFilters.cinemaIds.length > 0) {
        if (!globalFilters.cinemaIds.includes(screening.cinema.id)) {
          return false;
        }
      }

      // GLOBAL FILTER: Formats from homepage
      // If user selected specific formats (35mm, IMAX, etc.), only show those
      if (!ignoreGlobalFilters && globalFilters.formats.length > 0) {
        const screeningFormat = screening.format?.toLowerCase() || "";
        if (!globalFilters.formats.some((f) => screeningFormat.includes(f.toLowerCase()))) {
          return false;
        }
      }

      // LOCAL FILTER: Cinema search (text-based, for additional filtering)
      if (filters.cinemaSearch.trim()) {
        const search = filters.cinemaSearch.toLowerCase();
        const cinemaName = screening.cinema.name.toLowerCase();
        const shortName = screening.cinema.shortName?.toLowerCase() || "";
        const area = screening.cinema.address?.area?.toLowerCase() || "";
        if (!cinemaName.includes(search) && !shortName.includes(search) && !area.includes(search)) {
          return false;
        }
      }

      // Time range filter (initialized from global, can be modified locally)
      const hour = getHours(new Date(screening.datetime));
      if (filters.timeFrom !== null && hour < filters.timeFrom) {
        return false;
      }
      if (filters.timeTo !== null && hour > filters.timeTo) {
        return false;
      }

      // Date filter (initialized from global range, shown as date pills)
      if (filters.selectedDates && filters.selectedDates.length > 0) {
        const screeningDate = new Date(screening.datetime);
        if (!filters.selectedDates.some((d) => isSameDay(d, screeningDate))) {
          return false;
        }
      }

      return true;
    });
  }, [screenings, filters, globalFilters.cinemaIds, globalFilters.formats, ignoreGlobalFilters]);

  // Show filters only if there are enough screenings
  const showFilters = screenings.length >= FILTER_THRESHOLD;

  if (screenings.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">No upcoming screenings scheduled.</p>
      </div>
    );
  }

  // Group by cinema
  const byCinema = new Map<string, { cinema: Screening["cinema"]; screenings: Screening[] }>();

  for (const screening of filteredScreenings) {
    if (!byCinema.has(screening.cinema.id)) {
      byCinema.set(screening.cinema.id, { cinema: screening.cinema, screenings: [] });
    }
    byCinema.get(screening.cinema.id)!.screenings.push(screening);
  }

  // Sort cinemas by next screening date
  const sortedCinemas = Array.from(byCinema.values()).sort((a, b) => {
    const aNext = Math.min(...a.screenings.map(s => new Date(s.datetime).getTime()));
    const bNext = Math.min(...b.screenings.map(s => new Date(s.datetime).getTime()));
    return aNext - bNext;
  });

  // Build description of active global filters
  const globalFilterDescriptions: string[] = [];
  if (globalFilters.cinemaIds.length > 0) {
    globalFilterDescriptions.push(
      globalFilters.cinemaIds.length === 1
        ? "1 cinema"
        : `${globalFilters.cinemaIds.length} cinemas`
    );
  }
  if (globalFilters.formats.length > 0) {
    globalFilterDescriptions.push(globalFilters.formats.join(", "));
  }
  if (filters.timeFrom !== null || filters.timeTo !== null) {
    const from = filters.timeFrom !== null ? `${filters.timeFrom}:00` : "any";
    const to = filters.timeTo !== null ? `${filters.timeTo}:00` : "any";
    if (from !== "any" || to !== "any") {
      globalFilterDescriptions.push(`${from} – ${to}`);
    }
  }

  return (
    <div>
      {/* Global filter indicator - shows filters applied from homepage */}
      {hasGlobalFiltersSet && (
        <div className={cn(
          "mb-4 px-3 py-2 rounded-lg flex items-center justify-between gap-2",
          ignoreGlobalFilters
            ? "bg-background-secondary border border-border-subtle"
            : "bg-accent-primary/10 border border-accent-primary/20"
        )}>
          <div className="flex items-center gap-2 text-sm">
            <Filter className={cn(
              "w-4 h-4 shrink-0",
              ignoreGlobalFilters ? "text-text-tertiary" : "text-accent-primary"
            )} />
            {ignoreGlobalFilters ? (
              <span className="text-text-secondary">
                Showing all screenings
              </span>
            ) : (
              <span className="text-text-secondary">
                Filtered by:{" "}
                <span className="text-text-primary font-medium">
                  {globalFilterDescriptions.join(" · ")}
                </span>
              </span>
            )}
          </div>
          <button
            onClick={() => {
              setIgnoreGlobalFilters(!ignoreGlobalFilters);
              posthog.capture("film_detail_filter_toggle", {
                film_id: film.id,
                action: ignoreGlobalFilters ? "apply_global_filters" : "show_all",
              });
            }}
            className="text-xs text-accent-primary hover:text-accent-primary-hover font-medium shrink-0"
          >
            {ignoreGlobalFilters ? "Apply filters" : "Show all"}
          </button>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <ScreeningFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
          availableDates={availableDates}
          screeningCount={screenings.length}
          filteredCount={filteredScreenings.length}
        />
      )}

      {/* Empty state when filters hide all results */}
      {filteredScreenings.length === 0 && screenings.length > 0 && (
        <EmptyState
          icon={<Search className="w-10 h-10" />}
          title="No screenings match your filters"
          description="Try adjusting your search or clearing filters."
          action={
            <button
              onClick={() =>
                setFilters({
                  cinemaSearch: "",
                  timeFrom: null,
                  timeTo: null,
                  selectedDates: null,
                })
              }
              className="px-4 py-2 rounded-lg text-sm font-medium text-accent-primary hover:bg-accent-primary/10 transition-colors"
            >
              Clear all filters
            </button>
          }
        />
      )}

      {/* Screenings list */}
      {sortedCinemas.length > 0 && (
        <div className="space-y-6">
          {sortedCinemas.map(({ cinema, screenings: cinemaScreenings }) => (
            <div key={cinema.id} className="bg-background-secondary rounded-lg border border-border-subtle shadow-card overflow-hidden">
              {/* Cinema Header */}
              <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
                <div>
                  <h3 className="font-display text-lg text-text-primary">{cinema.name}</h3>
                  {cinema.address?.area && (
                    <p className="text-sm text-text-tertiary flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      {cinema.address.area}
                    </p>
                  )}
                </div>
                <span className="text-sm text-text-tertiary font-mono">
                  {cinemaScreenings.length} {cinemaScreenings.length === 1 ? "show" : "shows"}
                </span>
              </div>

              {/* Screenings List */}
              <div className="divide-y divide-border-subtle">
                {cinemaScreenings
                  .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
                  .map((screening) => (
                    <div
                      key={screening.id}
                      className="px-4 py-3 flex items-center gap-4 hover:bg-surface-overlay-hover transition-colors"
                    >
                      {/* Date & Time */}
                      <div className="w-28 shrink-0">
                        <div className="text-text-primary font-medium">
                          {formatScreeningDate(new Date(screening.datetime))}
                        </div>
                        <div className="text-accent-highlight font-mono text-lg font-semibold">
                          {format(new Date(screening.datetime), "HH:mm")}
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex-1 flex flex-wrap gap-1.5">
                        {screening.format && formatBadgeColors[screening.format] && (
                          <span className={cn(
                            "px-2 py-0.5 text-xs font-mono uppercase rounded border",
                            formatBadgeColors[screening.format]
                          )}>
                            {screening.format}
                          </span>
                        )}
                        {screening.eventType && eventTypeBadges[screening.eventType] && (
                          <span className={cn(
                            "px-2 py-0.5 text-xs font-medium rounded",
                            eventTypeBadges[screening.eventType].className
                          )}>
                            {eventTypeBadges[screening.eventType].label}
                          </span>
                        )}
                        {screening.screen && (
                          <span className="px-2 py-0.5 text-xs text-text-tertiary bg-background-tertiary rounded border border-border-subtle">
                            {screening.screen}
                          </span>
                        )}
                      </div>

                      {/* Book Button */}
                      <a
                        href={screening.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackBookingClick(screening)}
                        className="shrink-0 px-4 py-2 text-sm font-medium text-text-inverse bg-accent-primary hover:bg-accent-primary-hover rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        Book
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
