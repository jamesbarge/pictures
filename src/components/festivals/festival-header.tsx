"use client";

/**
 * FestivalHeader Component
 * Displays festival title, dates, status, and description
 */

import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { FestivalSelect } from "@/db/schema/festivals";

interface FestivalHeaderProps {
  festival: FestivalSelect;
  status: "upcoming" | "ongoing" | "past";
}

export function FestivalHeader({ festival, status }: FestivalHeaderProps) {
  const startDate = new Date(festival.startDate);
  const endDate = new Date(festival.endDate);

  // Format date range
  const formatDateRange = () => {
    const startMonth = format(startDate, "MMMM");
    const endMonth = format(endDate, "MMMM");
    const startDay = format(startDate, "d");
    const endDay = format(endDate, "d");
    const year = format(startDate, "yyyy");

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay}-${endDay}, ${year}`;
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
  };

  // Get status badge config
  const getStatusBadge = () => {
    switch (status) {
      case "ongoing":
        return { variant: "success" as const, text: "Happening Now" };
      case "upcoming":
        const distance = formatDistanceToNow(startDate, { addSuffix: true });
        return { variant: "primary" as const, text: `Starts ${distance}` };
      case "past":
        return { variant: "default" as const, text: "Ended" };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="max-w-4xl mx-auto px-4 pt-8">
      {/* Short name / Year pill */}
      {festival.shortName && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-mono uppercase tracking-wider text-text-tertiary">
            {festival.shortName} {festival.year}
          </span>
        </div>
      )}

      {/* Title */}
      <h1 className="text-3xl md:text-4xl font-display text-text-primary mb-3">
        {festival.name}
      </h1>

      {/* Date and Status row */}
      <div className="flex flex-wrap items-center gap-3 text-text-secondary mb-6">
        <span className="inline-flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          {formatDateRange()}
        </span>
        <Badge variant={statusBadge.variant}>{statusBadge.text}</Badge>
      </div>

      {/* Description */}
      {festival.description && (
        <p className="text-text-secondary text-lg leading-relaxed max-w-2xl">
          {festival.description}
        </p>
      )}

      {/* Genre tags */}
      {festival.genreFocus && festival.genreFocus.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-6">
          {festival.genreFocus.map((genre) => (
            <Badge key={genre} variant="outline" size="sm" className="capitalize">
              {genre}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
