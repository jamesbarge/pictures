/**
 * Travel Time Client Utilities
 *
 * Client-side functions for fetching travel times and filtering screenings
 * based on reachability. No date-fns — uses manual date math.
 */

export type TravelMode = 'transit' | 'walking' | 'bicycling';

export interface Coordinates {
	lat: number;
	lng: number;
}

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

// ============================================================================
// Date helpers (replaces date-fns)
// ============================================================================

function addMinutes(date: Date, minutes: number): Date {
	return new Date(date.getTime() + minutes * 60_000);
}

function subMinutes(date: Date, minutes: number): Date {
	return new Date(date.getTime() - minutes * 60_000);
}

function differenceInMinutes(a: Date, b: Date): number {
	return Math.round((a.getTime() - b.getTime()) / 60_000);
}

// ============================================================================
// Travel Time Fetching
// ============================================================================

/**
 * Fetch travel times from user location to multiple cinemas.
 * Handles batching for large numbers of destinations.
 */
export async function fetchTravelTimes(
	origin: Coordinates,
	cinemas: Cinema[],
	mode: TravelMode
): Promise<Record<string, { minutes: number; mode: string }>> {
	const validCinemas = cinemas.filter((c) => c.coordinates !== null);

	if (validCinemas.length === 0) {
		return {};
	}

	// Google Distance Matrix limits: 25 destinations per request
	const BATCH_SIZE = 25;
	const batches: Cinema[][] = [];

	for (let i = 0; i < validCinemas.length; i += BATCH_SIZE) {
		batches.push(validCinemas.slice(i, i + BATCH_SIZE));
	}

	const results = await Promise.all(
		batches.map((batch) => fetchTravelTimesBatch(origin, batch, mode))
	);

	const merged: Record<string, { minutes: number; mode: string }> = {};
	for (const result of results) {
		Object.assign(merged, result);
	}

	return merged;
}

async function fetchTravelTimesBatch(
	origin: Coordinates,
	cinemas: Cinema[],
	mode: TravelMode
): Promise<Record<string, { minutes: number; mode: string }>> {
	try {
		const response = await fetch('/api/travel-times', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				origin,
				destinations: cinemas.map((c) => ({
					id: c.id,
					lat: c.coordinates!.lat,
					lng: c.coordinates!.lng
				})),
				mode
			})
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(error.error || `HTTP ${response.status}`);
		}

		const data: TravelTimesResponse = await response.json();
		return data.travelTimes;
	} catch (error) {
		console.error('Failed to fetch travel times:', error);
		throw error;
	}
}

// ============================================================================
// Screening Filtering
// ============================================================================

/** A screening with its associated cinema and film data */
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

/** A screening the user can reach in time, with travel duration and departure info */
export interface ReachableScreening extends Screening {
	travelMinutes: number;
	travelMode: string;
	leaveBy: Date;
	minutesUntilLeave: number;
	screeningEnd: Date;
}

/**
 * Filter screenings to only those the user can reach and finish before their deadline.
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
		if (!travelData) continue;

		const { minutes: travelMinutes, mode: travelMode } = travelData;
		const runtime = screening.film.runtime ?? 120;

		const screeningStart = new Date(screening.datetime);
		const screeningEnd = addMinutes(screeningStart, runtime);

		// Must finish before deadline
		if (screeningEnd > finishedByTime) continue;

		// Calculate when user needs to leave
		const leaveBy = subMinutes(screeningStart, travelMinutes);

		// Must leave in the future
		if (leaveBy <= currentTime) continue;

		const minutesUntilLeave = differenceInMinutes(leaveBy, currentTime);

		reachable.push({
			...screening,
			travelMinutes,
			travelMode,
			leaveBy,
			minutesUntilLeave,
			screeningEnd
		});
	}

	// Sort by shortest travel time (closest cinemas first)
	return reachable.sort((a, b) => a.travelMinutes - b.travelMinutes);
}

// ============================================================================
// Urgency Grouping
// ============================================================================

export type UrgencyGroup = 'leave_soon' | 'leave_within_hour' | 'later';

/** Bucket reachable screenings by departure urgency. */
export function groupByUrgency(
	screenings: ReachableScreening[]
): Record<UrgencyGroup, ReachableScreening[]> {
	const groups: Record<UrgencyGroup, ReachableScreening[]> = {
		leave_soon: [],
		leave_within_hour: [],
		later: []
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

/** Get urgency group label */
export function getUrgencyLabel(group: UrgencyGroup): string {
	const labels: Record<UrgencyGroup, string> = {
		leave_soon: 'Leave soon',
		leave_within_hour: 'Leave within an hour',
		later: 'Later'
	};
	return labels[group];
}

/**
 * Format "leave by" time for display.
 * e.g. "Leave now!", "Leave in 15 min", "Leave by 6:12 pm"
 */
export function formatLeaveBy(leaveBy: Date, minutesUntilLeave: number): string {
	if (minutesUntilLeave <= 5) {
		return 'Leave now!';
	}

	if (minutesUntilLeave <= 30) {
		return `Leave in ${minutesUntilLeave} min`;
	}

	return `Leave by ${leaveBy.toLocaleTimeString('en-GB', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	})}`;
}

/** Format travel time for display */
export function formatTravelTime(minutes: number): string {
	if (minutes < 60) {
		return `${minutes} min`;
	}
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
