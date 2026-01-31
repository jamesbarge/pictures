"use client";

/**
 * FestivalVenues Component
 * Displays the venues hosting festival screenings
 */

import Link from "next/link";
import { MapPin, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Venue {
  id: string;
  name: string;
  shortName: string | null;
  address: { area?: string } | null;
}

interface FestivalVenuesProps {
  venues: Venue[];
}

export function FestivalVenues({ venues }: FestivalVenuesProps) {
  if (venues.length === 0) return null;

  return (
    <div>
      <h2 className="text-xl font-display text-text-primary mb-4">
        Venues
        <span className="text-sm font-mono text-text-tertiary ml-2">
          ({venues.length})
        </span>
      </h2>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {venues.map((venue) => (
          <Link
            key={venue.id}
            href={`/?cinema=${venue.id}`}
            className="group flex items-center gap-3 p-4 rounded-lg bg-background-secondary border border-border-subtle hover:border-accent-primary/30 transition-colors"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-background-tertiary flex items-center justify-center text-text-tertiary group-hover:text-accent-primary group-hover:bg-accent-primary/10 transition-colors">
              <MapPin className="w-5 h-5" aria-hidden="true" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-medium text-text-primary group-hover:text-accent-primary transition-colors truncate">
                {venue.shortName || venue.name}
              </p>
              {venue.address?.area && (
                <p className="text-xs text-text-tertiary truncate">
                  {venue.address.area}
                </p>
              )}
            </div>

            <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-accent-primary transition-colors" aria-hidden="true" />
          </Link>
        ))}
      </div>

      <p className="text-xs text-text-tertiary mt-3">
        Click a venue to see all screenings at that location
      </p>
    </div>
  );
}
