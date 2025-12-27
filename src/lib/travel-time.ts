/**
 * Travel Time Client Utilities
 *
 * Client-side functions for fetching travel times and filtering screenings
 * based on reachability.
 */

import { addMinutes, differenceInMinutes, subMinutes } from "date-fns";
import type { TravelMode, Coordinates } from "@/stores/reachable";

interface Cinema {
  id: string;
  coordinates: { lat: number; lng: number } | null;
}

interface TravelTimesResponse {
  travelTimes: Record<string, { minutes: number; mode: string }>;
  calculatedAt: string;
  cached: boolean;
  error?: string;
}

/**
 * Fetch travel times from user location to multiple cinemas
 * Handles batching for large numbers of destinations
 */
export async function fetchTravelTimes(
  origin: Coordinates,
  cinemas: Cinema[],
  mode: TravelMode
): Promise<Record<string, { minutes: number; mode: string }>> {
  // Filter to cinemas with valid coordinates
  const validCinemas = cinemas.filter((c) => c.coordinates !== null);

  if (validCinemas.length === 0) {
    return {};
  }

  // Google Distance Matrix has a limit of 25 destinations per request
  const BATCH_SIZE = 25;
  const batches: Cinema[][] = [];

  for (let i = 0; i < validCinemas.length; i += BATCH_SIZE) {
    batches.push(validCinemas.slice(i, i + BATCH_SIZE));
  }

  // Fetch all batches in parallel
  const results = await Promise.all(
    batches.map((batch) => fetchTravelTimesBatch(origin, batch, mode))
  );

  // Merge all results
  const merged: Record<string, { minutes: number; mode: string }> = {};
  for (const result of results) {
    Object.assign(merged, result);
  }

  return merged;
}

/**
 * Fetch a single batch of travel times (max 25 destinations)
 */
async function fetchTravelTimesBatch(
  origin: Coordinates,
  cinemas: Cinema[],
  mode: TravelMode
): Promise<Record<string, { minutes: number; mode: string }>> {
  try {
    const response = await fetch("/api/travel-times", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin,
        destinations: cinemas.map((c) => ({
          id: c.id,
          lat: c.coordinates!.lat,
          lng: c.coordinates!.lng,
        })),
        mode,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const data: TravelTimesResponse = await response.json();
    return data.travelTimes;
  } catch (error) {
    console.error("Failed to fetch travel times:", error);
    throw error;
  }
}

// ============================================================================
// Screening Filtering
// ============================================================================

export interface Screening {
  id: string;
  datetime: string;
  format?: string | null;
  bookingUrl?: string | null;
  cinema: { id: string; name: string; shortName: string | null };
  film: {
    id: string;
    title: string;
    year?: number | null;
    runtime: number | null;
    posterUrl?: string | null;
  };
}

export interface ReachableScreening extends Screening {
  travelMinutes: number;
  travelMode: string;
  leaveBy: Date;
  minutesUntilLeave: number;
  screeningEnd: Date;
}

/**
 * Filter screenings to only those the user can reach and finish before their deadline
 *
 * @param screenings - All available screenings
 * @param travelTimes - Map of cinemaId → travel data
 * @param finishedByTime - User's deadline (when they need to be free)
 * @param currentTime - Current time (defaults to now, useful for testing)
 */
export function getReachableScreenings(
  screenings: Screening[],
  travelTimes: Record<string, { minutes: number; mode: string }>,
  finishedByTime: Date,
  currentTime: Date = new Date()
): ReachableScreening[] {
  const reachable: ReachableScreening[] = [];

  for (const screening of screenings) {
    const travelData = travelTimes[screening.cinema.id];

    // Skip if we don't have travel time for this cinema
    if (!travelData) {
      continue;
    }

    const { minutes: travelMinutes, mode: travelMode } = travelData;

    // Use actual runtime or default to 120 minutes
    const runtime = screening.film.runtime ?? 120;

    const screeningStart = new Date(screening.datetime);
    const screeningEnd = addMinutes(screeningStart, runtime);

    // Must finish before deadline
    if (screeningEnd > finishedByTime) {
      continue;
    }

    // Calculate when user needs to leave
    const leaveBy = subMinutes(screeningStart, travelMinutes);

    // Must leave in the future (can't time travel!)
    if (leaveBy <= currentTime) {
      continue;
    }

    const minutesUntilLeave = differenceInMinutes(leaveBy, currentTime);

    reachable.push({
      ...screening,
      travelMinutes,
      travelMode,
      leaveBy,
      minutesUntilLeave,
      screeningEnd,
    });
  }

  // Sort by when user needs to leave (soonest first)
  return reachable.sort((a, b) => a.minutesUntilLeave - b.minutesUntilLeave);
}

/**
 * Group reachable screenings by urgency
 */
export type UrgencyGroup = "leave_soon" | "leave_within_hour" | "later";

export function groupByUrgency(
  screenings: ReachableScreening[]
): Record<UrgencyGroup, ReachableScreening[]> {
  const groups: Record<UrgencyGroup, ReachableScreening[]> = {
    leave_soon: [],      // Leave in next 30 mins
    leave_within_hour: [], // Leave in 30-60 mins
    later: [],           // Leave in 60+ mins
  };

  for (const screening of screenings) {
    if (screening.minutesUntilLeave <= 30) {
      groups.leave_soon.push(screening);
    } else if (screening.minutesUntilLeave <= 60) {
      groups.leave_within_hour.push(screening);
    } else {
      groups.later.push(screening);
    }
  }

  return groups;
}

/**
 * Get urgency group label
 */
export function getUrgencyLabel(group: UrgencyGroup): string {
  const labels: Record<UrgencyGroup, string> = {
    leave_soon: "Leave soon",
    leave_within_hour: "Leave within an hour",
    later: "Later",
  };
  return labels[group];
}

/**
 * Format "leave by" time for display
 * e.g., "6:12 PM" or "in 15 min"
 */
export function formatLeaveBy(leaveBy: Date, minutesUntilLeave: number): string {
  if (minutesUntilLeave <= 5) {
    return "Leave now!";
  }

  if (minutesUntilLeave <= 30) {
    return `Leave in ${minutesUntilLeave} min`;
  }

  // Format as time
  return `Leave by ${leaveBy.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}`;
}
