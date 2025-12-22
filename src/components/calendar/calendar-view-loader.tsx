"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { CalendarView } from "./calendar-view";
import { Loader2, ChevronDown } from "lucide-react";

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

async function fetchMoreScreenings(startDay: number, endDay: number): Promise<Screening[]> {
  const now = new Date();
  const startDate = addDays(now, startDay);
  const endDate = addDays(now, endDay);

  const params = new URLSearchParams({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  const res = await fetch(`/api/screenings?${params}`);
  if (!res.ok) throw new Error("Failed to fetch screenings");

  const data = await res.json();
  return data.screenings;
}

export function CalendarViewWithLoader({ initialScreenings }: CalendarViewWithLoaderProps) {
  // Track how many weeks we've loaded (starts at 1 = first 7 days from server)
  const [weeksLoaded, setWeeksLoaded] = useState(1);
  const maxWeeks = 4; // Up to 4 weeks (28 days)

  // Fetch week 2 (days 8-14)
  const week2Query = useQuery({
    queryKey: ["screenings", "week2"],
    queryFn: () => fetchMoreScreenings(7, 14),
    enabled: weeksLoaded >= 2,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch week 3 (days 15-21)
  const week3Query = useQuery({
    queryKey: ["screenings", "week3"],
    queryFn: () => fetchMoreScreenings(14, 21),
    enabled: weeksLoaded >= 3,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch week 4 (days 22-28)
  const week4Query = useQuery({
    queryKey: ["screenings", "week4"],
    queryFn: () => fetchMoreScreenings(21, 28),
    enabled: weeksLoaded >= 4,
    staleTime: 5 * 60 * 1000,
  });

  // Merge all loaded screenings
  const allScreenings = useMemo(() => {
    const screenings = [...initialScreenings];

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
  }, [initialScreenings, week2Query.data, week3Query.data, week4Query.data]);

  const isLoading =
    (weeksLoaded >= 2 && week2Query.isLoading) ||
    (weeksLoaded >= 3 && week3Query.isLoading) ||
    (weeksLoaded >= 4 && week4Query.isLoading);

  const canLoadMore = weeksLoaded < maxWeeks;

  const handleLoadMore = () => {
    if (canLoadMore) {
      setWeeksLoaded((w) => w + 1);
    }
  };

  // Calculate what date range we're showing
  const endDate = addDays(new Date(), weeksLoaded * 7);
  const dateLabel = format(endDate, "d MMMM");

  return (
    <div>
      <CalendarView screenings={allScreenings} />

      {/* Load More Button */}
      {canLoadMore && (
        <div className="flex justify-center py-8">
          <button
            onClick={handleLoadMore}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-background-secondary border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-default shadow-card transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading more screenings...
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Load more (showing until {dateLabel})
              </>
            )}
          </button>
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
