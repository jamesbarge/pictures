/**
 * Reachable Results Component
 * Displays filtered screenings with travel time and "leave by" information
 */

"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";

// Tiny placeholder for blur effect during image load
const POSTER_BLUR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAPCAYAAADd/14OAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAKklEQVQoz2Nk+M/AQAxgZGBg+M9AB2BkYGBgZGRgYGCgF2D4T7wexAAGABPmAhHXnXDuAAAAAElFTkSuQmCC";
import { Clock, MapPin, Train, Calendar, ExternalLink, Footprints, Bike } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/cn";
import {
  groupByUrgency,
  getUrgencyLabel,
  formatLeaveBy,
  type ReachableScreening,
  type UrgencyGroup,
} from "@/lib/travel-time";
import { formatTravelTime } from "@/stores/reachable";

interface ReachableResultsProps {
  screenings: ReachableScreening[];
  totalScreenings: number;
  finishedByTime: Date;
}

export function ReachableResults({
  screenings,
  totalScreenings,
  finishedByTime,
}: ReachableResultsProps) {
  // Group screenings by urgency
  const groups = useMemo(() => groupByUrgency(screenings), [screenings]);

  // Empty state
  if (screenings.length === 0) {
    return (
      <div className="p-8 bg-background-secondary border border-border-subtle rounded-lg text-center">
        <Calendar className="w-10 h-10 text-text-tertiary mx-auto mb-4" />
        <h2 className="text-lg font-medium text-text-primary mb-2">
          No reachable screenings
        </h2>
        <p className="text-text-secondary text-sm max-w-md mx-auto">
          No screenings finish before{" "}
          <span className="font-medium">{format(finishedByTime, "h:mm a")}</span>{" "}
          that you can reach in time. Try a later deadline or different travel mode.
        </p>
        <p className="text-text-tertiary text-xs mt-4">
          Checked {totalScreenings} screenings across all cinemas
        </p>
      </div>
    );
  }

  const urgencyOrder: UrgencyGroup[] = ["leave_soon", "leave_within_hour", "later"];

  return (
    <div className="space-y-8">
      {urgencyOrder.map((urgency) => {
        const groupScreenings = groups[urgency];
        if (groupScreenings.length === 0) return null;

        return (
          <div key={urgency}>
            {/* Group Header */}
            <div className="flex items-center gap-2 mb-4">
              <h2
                className={cn(
                  "text-sm font-semibold uppercase tracking-wide",
                  urgency === "leave_soon" && "text-error-text",
                  urgency === "leave_within_hour" && "text-warning-text",
                  urgency === "later" && "text-text-secondary"
                )}
              >
                {getUrgencyLabel(urgency)}
              </h2>
              <span className="text-xs text-text-tertiary">
                ({groupScreenings.length})
              </span>
            </div>

            {/* Screening Cards */}
            <div className="space-y-3">
              {groupScreenings.map((screening) => (
                <ReachableScreeningCard
                  key={screening.id}
                  screening={screening}
                  urgency={urgency}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Individual screening card
function ReachableScreeningCard({
  screening,
  urgency,
}: {
  screening: ReachableScreening;
  urgency: UrgencyGroup;
}) {
  const screeningTime = new Date(screening.datetime);

  return (
    <div className="flex gap-4 p-4 bg-background-secondary border border-border-subtle rounded-lg hover:border-border-default transition-colors">
      {/* Poster */}
      <div className="flex-shrink-0 w-16 sm:w-20">
        {screening.film.posterUrl ? (
          <Image
            src={screening.film.posterUrl}
            alt={screening.film.title}
            width={80}
            height={120}
            className="w-full aspect-[2/3] object-cover rounded"
            placeholder="blur"
            blurDataURL={POSTER_BLUR}
          />
        ) : (
          <div className="w-full aspect-[2/3] bg-background-tertiary rounded flex items-center justify-center">
            <span className="text-text-tertiary text-xs">No poster</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Leave By Badge - Most Important! */}
        <div
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-2",
            urgency === "leave_soon" && "bg-error-surface text-error-text",
            urgency === "leave_within_hour" && "bg-warning-surface text-warning-text",
            urgency === "later" && "bg-accent-primary/10 text-accent-primary"
          )}
        >
          <Clock className="w-3.5 h-3.5" />
          {formatLeaveBy(screening.leaveBy, screening.minutesUntilLeave)}
        </div>

        {/* Film Title */}
        <Link href={`/film/${screening.film.id}`}>
          <h3 className="font-medium text-text-primary hover:text-accent-primary transition-colors line-clamp-1">
            {screening.film.title}
            {screening.film.year && (
              <span className="text-text-tertiary font-normal ml-1">
                ({screening.film.year})
              </span>
            )}
          </h3>
        </Link>

        {/* Screening Details */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-text-secondary">
          {/* Time */}
          <span className="font-medium text-text-primary">
            {format(screeningTime, "h:mm a")}
          </span>

          {/* Cinema */}
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {screening.cinema.shortName || screening.cinema.name}
          </span>

          {/* Travel Time */}
          <span className="flex items-center gap-1 text-accent-primary">
            {screening.travelMode === "walking" ? (
              <Footprints className="w-3.5 h-3.5" />
            ) : screening.travelMode === "bicycling" ? (
              <Bike className="w-3.5 h-3.5" />
            ) : (
              <Train className="w-3.5 h-3.5" />
            )}
            {formatTravelTime(screening.travelMinutes)}
          </span>

          {/* Runtime */}
          {screening.film.runtime && (
            <span className="text-text-tertiary">
              {screening.film.runtime} min
            </span>
          )}

          {/* Format */}
          {screening.format && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-background-tertiary text-text-secondary">
              {screening.format}
            </span>
          )}
        </div>

        {/* Booking Link */}
        {screening.bookingUrl && (
          <a
            href={screening.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-xs text-accent-primary hover:underline"
          >
            Book tickets
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}
