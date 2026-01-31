"use client";

/**
 * FestivalList Component
 * Displays festivals grouped by status (ongoing, upcoming, past)
 */

import { useMemo, useState } from "react";
import { FestivalCard, FestivalCardSkeleton, type FestivalCardProps } from "./festival-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Calendar, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Festival = FestivalCardProps["festival"];

interface FestivalListProps {
  festivals: Festival[];
}

export function FestivalList({ festivals }: FestivalListProps) {

  // Group festivals by status
  const grouped = useMemo(() => {
    const ongoing: Festival[] = [];
    const upcoming: Festival[] = [];
    const past: Festival[] = [];

    for (const festival of festivals) {
      switch (festival.status) {
        case "ongoing":
          ongoing.push(festival);
          break;
        case "upcoming":
          upcoming.push(festival);
          break;
        case "past":
          past.push(festival);
          break;
      }
    }

    return { ongoing, upcoming, past };
  }, [festivals]);

  const hasAnyFestivals = grouped.ongoing.length > 0 || grouped.upcoming.length > 0;

  if (festivals.length === 0) {
    return (
      <EmptyState
        icon={<Calendar className="w-12 h-12" aria-hidden="true" />}
        title="No festivals found"
        description="Check back later for upcoming film festivals in London"
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Happening Now */}
      {grouped.ongoing.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xl font-display text-text-primary">Happening Now</h2>
            <Badge variant="success" size="sm">
              {grouped.ongoing.length}
            </Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.ongoing.map((festival) => (
              <FestivalCard key={festival.id} festival={festival} />
            ))}
          </div>
        </section>
      )}

      {/* Coming Up */}
      {grouped.upcoming.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xl font-display text-text-primary">Coming Up</h2>
            <Badge variant="primary" size="sm">
              {grouped.upcoming.length}
            </Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.upcoming.map((festival) => (
              <FestivalCard key={festival.id} festival={festival} />
            ))}
          </div>
        </section>
      )}

      {/* No active festivals message */}
      {!hasAnyFestivals && (
        <EmptyState
          icon={<Calendar className="w-12 h-12" aria-hidden="true" />}
          title="No upcoming festivals"
          description="Check back later for upcoming film festivals in London"
        />
      )}
    </div>
  );
}

// Timeline variant - shows festivals in a linear timeline
export function FestivalTimeline({ festivals }: { festivals: Festival[] }) {
  // Sort by start date
  const sortedFestivals = useMemo(() => {
    return [...festivals].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
  }, [festivals]);

  if (sortedFestivals.length === 0) {
    return (
      <EmptyState
        icon={<Calendar className="w-12 h-12" aria-hidden="true" />}
        title="No festivals found"
        description="Check back later for upcoming film festivals in London"
      />
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border-subtle" />

      <div className="space-y-6">
        {sortedFestivals.map((festival, index) => (
          <div key={festival.id} className="relative pl-10">
            {/* Timeline dot */}
            <div
              className={`absolute left-2 top-6 w-4 h-4 rounded-full border-2 ${
                festival.status === "ongoing"
                  ? "bg-accent-success border-accent-success"
                  : festival.status === "upcoming"
                  ? "bg-accent-primary border-accent-primary"
                  : "bg-background-tertiary border-border-default"
              }`}
            />
            <FestivalCard festival={festival} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Loading skeleton
export function FestivalListSkeleton() {
  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-6 bg-background-tertiary rounded w-32 skeleton animate-pulse" />
          <div className="h-5 bg-background-tertiary rounded w-6 skeleton animate-pulse" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <FestivalCardSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
