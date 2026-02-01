"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, differenceInDays, startOfDay } from "date-fns";
import { CalendarView } from "./calendar-view";
import { ErrorBoundary } from "@/components/error-boundary";
import { Loader2, X, Clapperboard, Film } from "lucide-react";
import { useFilters } from "@/stores/filters";
import { useUrlFilters } from "@/hooks/useUrlFilters";

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

interface CalendarViewWithLoaderProps {
  initialScreenings: Screening[];
}

interface FetchOptions {
  startDay: number;
  endDay: number;
  festivalSlug?: string | null;
  festivalOnly?: boolean;
  seasonSlug?: string | null;
}

async function fetchMoreScreenings({
  startDay,
  endDay,
  festivalSlug,
  festivalOnly,
  seasonSlug,
}: FetchOptions): Promise<Screening[]> {
  const now = new Date();
  const startDate = addDays(now, startDay);
  const endDate = addDays(now, endDay);

  const params = new URLSearchParams({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  // Add festival filter if specified
  if (festivalSlug) {
    params.set("festival", festivalSlug);
  }
  if (festivalOnly) {
    params.set("festivalOnly", "true");
  }

  // Add season filter if specified
  if (seasonSlug) {
    params.set("season", seasonSlug);
  }

  const res = await fetch(`/api/screenings?${params}`);
  if (!res.ok) throw new Error("Failed to fetch screenings");

  const data = await res.json();
  return data.screenings;
}

export function CalendarViewWithLoader({ initialScreenings }: CalendarViewWithLoaderProps) {
  // Track load state (0 = initial 3 days, 1 = week 1 complete, 2-4 = additional weeks)
  const [loadState, setLoadState] = useState(0);
  const maxLoadState = 4; // Up to 4 weeks (28 days)

  // Ref for the infinite scroll sentinel element
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Get date filter from store to auto-load when user selects future dates
  const dateTo = useFilters((state) => state.dateTo);

  // Festival filter from store
  const festivalSlug = useFilters((state) => state.festivalSlug);
  const festivalOnly = useFilters((state) => state.festivalOnly);
  const clearFestivalFilter = useFilters((state) => state.clearFestivalFilter);

  // Season filter from store
  const seasonSlug = useFilters((state) => state.seasonSlug);
  const clearSeasonFilter = useFilters((state) => state.clearSeasonFilter);

  // URL filter sync - handles all filter params including festival
  useUrlFilters();

  // Auto-load more weeks when dateTo extends beyond currently loaded data
  useEffect(() => {
    if (!dateTo) return;

    const today = startOfDay(new Date());
    const daysUntilDateTo = differenceInDays(startOfDay(dateTo), today);

    // Calculate required loadState based on days needed
    // loadState 0 = 3 days, 1 = 7 days, 2 = 14 days, 3 = 21 days, 4 = 28 days
    let requiredState: number;
    if (daysUntilDateTo <= 3) {
      requiredState = 0;
    } else if (daysUntilDateTo <= 7) {
      requiredState = 1;
    } else if (daysUntilDateTo <= 14) {
      requiredState = 2;
    } else if (daysUntilDateTo <= 21) {
      requiredState = 3;
    } else {
      requiredState = 4;
    }

    // Only increase loadState, never decrease (user might have manually loaded more)
    if (requiredState > loadState && requiredState <= maxLoadState) {
      setLoadState(requiredState);
    }
  }, [dateTo, loadState, maxLoadState]);

  // Include festival and season in query key so React Query refetches when filter changes
  const festivalKey = festivalSlug || "all";
  const seasonKey = seasonSlug || "all";
  const filterKey = `${festivalKey}-${seasonKey}`;

  // When festival or season filter is active, fetch initial 3 days with filter (server data is unfiltered)
  const initialFilterQuery = useQuery({
    queryKey: ["screenings", "initial-filter", festivalSlug, seasonSlug],
    queryFn: () => fetchMoreScreenings({ startDay: 0, endDay: 3, festivalSlug, festivalOnly, seasonSlug }),
    enabled: !!festivalSlug || !!seasonSlug, // Only fetch when a filter is active
    staleTime: 5 * 60 * 1000,
  });

  // Fetch rest of week 1 (days 4-7) - server only sends 3 days for fast initial load
  const week1RestQuery = useQuery({
    queryKey: ["screenings", "week1-rest", filterKey],
    queryFn: () => fetchMoreScreenings({ startDay: 3, endDay: 7, festivalSlug, festivalOnly, seasonSlug }),
    enabled: loadState >= 1,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch week 2 (days 8-14)
  const week2Query = useQuery({
    queryKey: ["screenings", "week2", filterKey],
    queryFn: () => fetchMoreScreenings({ startDay: 7, endDay: 14, festivalSlug, festivalOnly, seasonSlug }),
    enabled: loadState >= 2,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch week 3 (days 15-21)
  const week3Query = useQuery({
    queryKey: ["screenings", "week3", filterKey],
    queryFn: () => fetchMoreScreenings({ startDay: 14, endDay: 21, festivalSlug, festivalOnly, seasonSlug }),
    enabled: loadState >= 3,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch week 4 (days 22-28)
  const week4Query = useQuery({
    queryKey: ["screenings", "week4", filterKey],
    queryFn: () => fetchMoreScreenings({ startDay: 21, endDay: 28, festivalSlug, festivalOnly, seasonSlug }),
    enabled: loadState >= 4,
    staleTime: 5 * 60 * 1000,
  });

  // Merge all loaded screenings
  const allScreenings = useMemo(() => {
    // Use filtered initial data when festival or season filter is active, otherwise use server data
    const hasFilter = festivalSlug || seasonSlug;
    const baseScreenings = hasFilter && initialFilterQuery.data
      ? initialFilterQuery.data
      : hasFilter
        ? [] // Loading filtered data
        : initialScreenings;

    const screenings = [...baseScreenings];

    if (week1RestQuery.data) {
      screenings.push(...week1RestQuery.data);
    }
    if (week2Query.data) {
      screenings.push(...week2Query.data);
    }
    if (week3Query.data) {
      screenings.push(...week3Query.data);
    }
    if (week4Query.data) {
      screenings.push(...week4Query.data);
    }

    // Deduplicate by ID and sort by datetime
    const uniqueMap = new Map<string, Screening>();
    for (const s of screenings) {
      uniqueMap.set(s.id, s);
    }

    return Array.from(uniqueMap.values()).sort(
      (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
    );
  }, [initialScreenings, festivalSlug, seasonSlug, initialFilterQuery.data, week1RestQuery.data, week2Query.data, week3Query.data, week4Query.data]);

  const isLoading =
    ((festivalSlug || seasonSlug) && initialFilterQuery.isLoading) ||
    (loadState >= 1 && week1RestQuery.isLoading) ||
    (loadState >= 2 && week2Query.isLoading) ||
    (loadState >= 3 && week3Query.isLoading) ||
    (loadState >= 4 && week4Query.isLoading);

  const canLoadMore = loadState < maxLoadState;

  const handleLoadMore = useCallback(() => {
    if (canLoadMore && !isLoading) {
      setLoadState((s) => s + 1);
    }
  }, [canLoadMore, isLoading]);

  // Infinite scroll: observe sentinel element
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // When sentinel becomes visible, load more
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      {
        // Trigger when sentinel is 200px from viewport (load early for smooth UX)
        rootMargin: "200px",
        threshold: 0,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [handleLoadMore]);

  // Format festival slug for display (bfi-lff-2026 -> BFI LFF 2026)
  const formatFestivalName = (slug: string) => {
    return slug
      .split("-")
      .map((word) => (word.length <= 3 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
      .join(" ");
  };

  return (
    <div>
      {/* Festival Filter Banner */}
      {festivalSlug && (
        <div className="mb-6 p-4 bg-accent-gold/10 border border-accent-gold/30 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clapperboard className="w-5 h-5 text-accent-gold" />
            <span className="text-text-primary font-medium">
              Showing screenings from{" "}
              <span className="text-accent-gold">{formatFestivalName(festivalSlug)}</span>
            </span>
          </div>
          <button
            onClick={clearFestivalFilter}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors rounded-lg hover:bg-background-hover"
          >
            <X className="w-4 h-4" />
            <span>Clear filter</span>
          </button>
        </div>
      )}

      {/* Season Filter Banner */}
      {seasonSlug && (
        <div className="mb-6 p-4 bg-accent-primary/10 border border-accent-primary/30 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Film className="w-5 h-5 text-accent-primary" />
            <span className="text-text-primary font-medium">
              Showing screenings from{" "}
              <span className="text-accent-primary">{formatFestivalName(seasonSlug)}</span>
            </span>
          </div>
          <button
            onClick={clearSeasonFilter}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors rounded-lg hover:bg-background-hover"
          >
            <X className="w-4 h-4" />
            <span>Clear filter</span>
          </button>
        </div>
      )}

      {/* Loading state for filter */}
      {(festivalSlug || seasonSlug) && initialFilterQuery.isLoading && (
        <div className="flex items-center justify-center py-12 gap-3 text-text-secondary">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading {seasonSlug ? "season" : "festival"} screenings...</span>
        </div>
      )}

      <ErrorBoundary>
        <CalendarView screenings={allScreenings} />
      </ErrorBoundary>

      {/* Infinite scroll sentinel & loading indicator */}
      {canLoadMore && (
        <div ref={sentinelRef} className="py-8">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 text-text-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading more screenings...</span>
            </div>
          )}
        </div>
      )}

      {/* All loaded indicator */}
      {!canLoadMore && allScreenings.length > 0 && (
        <div className="text-center py-8 text-text-tertiary text-sm">
          Showing all screenings for the next 4 weeks
        </div>
      )}
    </div>
  );
}
