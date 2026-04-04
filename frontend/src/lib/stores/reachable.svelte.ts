/**
 * Reachable Cinemas Store (Svelte 5 runes)
 *
 * Manages state for the "What Can I Catch?" feature.
 * Persists user preferences (postcode, coordinates, travelMode) to localStorage.
 * Transient state (finishedByTime, travelTimes, isCalculating, error) is not persisted.
 */

import { browser } from '$app/environment';
import {
	fetchTravelTimes,
	type TravelMode,
	type Coordinates
} from '$lib/travel-time';
import type { Cinema } from '$lib/types';

const STORAGE_KEY = 'pictures-reachable';

interface PersistedState {
	postcode: string;
	coordinates: Coordinates | null;
	travelMode: TravelMode;
}

function loadPersisted(): PersistedState {
	if (!browser) return { postcode: '', coordinates: null, travelMode: 'transit' };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { postcode: '', coordinates: null, travelMode: 'transit' };
		const parsed = JSON.parse(raw);
		return {
			postcode: parsed.postcode ?? '',
			coordinates: parsed.coordinates ?? null,
			travelMode: parsed.travelMode ?? 'transit'
		};
	} catch {
		return { postcode: '', coordinates: null, travelMode: 'transit' };
	}
}

const initial = loadPersisted();

// Persisted state
let postcode = $state<string>(initial.postcode);
let coordinates = $state<Coordinates | null>(initial.coordinates);
let travelMode = $state<TravelMode>(initial.travelMode);

// Transient state
let finishedByTime = $state<Date | null>(null);
let travelTimes = $state<Record<string, { minutes: number; mode: string }>>({});
let isCalculating = $state<boolean>(false);
let error = $state<string | null>(null);

// Persist to localStorage
if (browser) {
	$effect.root(() => {
		$effect(() => {
			const data: PersistedState = { postcode, coordinates, travelMode };
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		});
	});
}

/**
 * Calculate travel times from user location to all cinemas.
 */
async function calculateTravelTimes(cinemas: Cinema[]): Promise<void> {
	if (!coordinates) {
		error = 'Enter a postcode first';
		return;
	}

	isCalculating = true;
	error = null;

	try {
		const cinemaDests = cinemas
			.filter((c) => c.coordinates !== null)
			.map((c) => ({ id: c.id, coordinates: c.coordinates }));

		const results = await fetchTravelTimes(coordinates, cinemaDests, travelMode);
		travelTimes = results;
	} catch (e) {
		error = e instanceof Error ? e.message : 'Failed to calculate travel times';
		travelTimes = {};
	} finally {
		isCalculating = false;
	}
}

export const reachableStore = {
	// Persisted
	get postcode() {
		return postcode;
	},
	set postcode(v: string) {
		postcode = v;
		error = null;
		// Clear travel times when postcode changes
		if (coordinates) {
			travelTimes = {};
		}
	},

	get coordinates() {
		return coordinates;
	},
	set coordinates(v: Coordinates | null) {
		coordinates = v;
		error = null;
	},

	get travelMode() {
		return travelMode;
	},
	set travelMode(v: TravelMode) {
		const prev = travelMode;
		travelMode = v;
		if (prev !== v) {
			travelTimes = {};
		}
	},

	// Transient
	get finishedByTime() {
		return finishedByTime;
	},
	set finishedByTime(v: Date | null) {
		finishedByTime = v;
	},

	get travelTimes() {
		return travelTimes;
	},
	set travelTimes(v: Record<string, { minutes: number; mode: string }>) {
		travelTimes = v;
	},

	get isCalculating() {
		return isCalculating;
	},

	get error() {
		return error;
	},
	set error(v: string | null) {
		error = v;
	},

	get hasValidInputs(): boolean {
		return !!(coordinates && finishedByTime && finishedByTime > new Date());
	},

	get hasTravelTimes(): boolean {
		return Object.keys(travelTimes).length > 0;
	},

	calculateTravelTimes,

	clear() {
		postcode = '';
		coordinates = null;
		finishedByTime = null;
		travelMode = 'transit';
		travelTimes = {};
		isCalculating = false;
		error = null;
	}
};
