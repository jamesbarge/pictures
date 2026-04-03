import { browser } from '$app/environment';
import type { FilterProgrammingType } from '$lib/constants/filters';

const STORAGE_KEY = 'pictures-filters';

interface PersistedFilters {
	cinemaIds: string[];
	formats: string[];
	programmingTypes: FilterProgrammingType[];
	genres: string[];
	decades: string[];
}

function loadPersisted(): Partial<PersistedFilters> {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

const persisted = loadPersisted();

// Filter state — Svelte 5 runes module
let filmSearch = $state('');
let cinemaIds = $state<string[]>(persisted.cinemaIds ?? []);
let dateFrom = $state<string | null>(null);
let dateTo = $state<string | null>(null);
let timeFrom = $state<number | null>(null);
let timeTo = $state<number | null>(null);
let formats = $state<string[]>(persisted.formats ?? []);
let programmingTypes = $state<FilterProgrammingType[]>(persisted.programmingTypes ?? []);
let genres = $state<string[]>(persisted.genres ?? []);
let decades = $state<string[]>(persisted.decades ?? []);
let hideSeen = $state(false);
let hideNotInterested = $state(true);
let showSoldOut = $state(false);

// Persist selected fields to localStorage
if (browser) {
	$effect.root(() => {
		$effect(() => {
			const data: PersistedFilters = {
				cinemaIds,
				formats,
				programmingTypes,
				genres,
				decades
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		});
	});
}

function activeFilterCount(): number {
	let count = 0;
	if (cinemaIds.length > 0) count++;
	if (dateFrom || dateTo) count++;
	if (timeFrom !== null || timeTo !== null) count++;
	if (formats.length > 0) count++;
	if (programmingTypes.length > 0) count++;
	if (genres.length > 0) count++;
	if (decades.length > 0) count++;
	return count;
}

function clearAll() {
	filmSearch = '';
	cinemaIds = [];
	dateFrom = null;
	dateTo = null;
	timeFrom = null;
	timeTo = null;
	formats = [];
	programmingTypes = [];
	genres = [];
	decades = [];
	hideSeen = false;
	hideNotInterested = true;
	showSoldOut = false;
}

export const filters = {
	get filmSearch() { return filmSearch; },
	set filmSearch(v: string) { filmSearch = v; },

	get cinemaIds() { return cinemaIds; },
	set cinemaIds(v: string[]) { cinemaIds = v; },

	get dateFrom() { return dateFrom; },
	set dateFrom(v: string | null) { dateFrom = v; },

	get dateTo() { return dateTo; },
	set dateTo(v: string | null) { dateTo = v; },

	get timeFrom() { return timeFrom; },
	set timeFrom(v: number | null) { timeFrom = v; },

	get timeTo() { return timeTo; },
	set timeTo(v: number | null) { timeTo = v; },

	get formats() { return formats; },
	set formats(v: string[]) { formats = v; },

	get programmingTypes() { return programmingTypes; },
	set programmingTypes(v: FilterProgrammingType[]) { programmingTypes = v; },

	get genres() { return genres; },
	set genres(v: string[]) { genres = v; },

	get decades() { return decades; },
	set decades(v: string[]) { decades = v; },

	get hideSeen() { return hideSeen; },
	set hideSeen(v: boolean) { hideSeen = v; },

	get hideNotInterested() { return hideNotInterested; },
	set hideNotInterested(v: boolean) { hideNotInterested = v; },

	get showSoldOut() { return showSoldOut; },
	set showSoldOut(v: boolean) { showSoldOut = v; },

	get activeFilterCount() { return activeFilterCount(); },
	clearAll,

	toggleCinema(id: string) {
		if (cinemaIds.includes(id)) {
			cinemaIds = cinemaIds.filter((c) => c !== id);
		} else {
			cinemaIds = [...cinemaIds, id];
		}
	},

	toggleFormat(fmt: string) {
		if (formats.includes(fmt)) {
			formats = formats.filter((f) => f !== fmt);
		} else {
			formats = [...formats, fmt];
		}
	},

	setDatePreset(preset: 'today' | 'weekend' | '7days' | null) {
		if (!preset) {
			dateFrom = null;
			dateTo = null;
			return;
		}
		const now = new Date();
		// Use London timezone for all date calculations
		const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

		if (preset === 'today') {
			dateFrom = todayStr;
			dateTo = todayStr;
		} else if (preset === 'weekend') {
			// Get London day of week
			const londonDow = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/London' }).format(now);
			const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
			const day = dayMap[londonDow] ?? now.getDay();
			const satOffset = day === 0 ? -1 : 6 - day;
			const londonNoon = new Date(todayStr + 'T12:00:00Z');
			const sat = new Date(londonNoon);
			sat.setUTCDate(londonNoon.getUTCDate() + satOffset);
			const sun = new Date(sat);
			sun.setUTCDate(sat.getUTCDate() + 1);
			dateFrom = sat.toISOString().split('T')[0];
			dateTo = sun.toISOString().split('T')[0];
		} else if (preset === '7days') {
			const londonNoon = new Date(todayStr + 'T12:00:00Z');
			const end = new Date(londonNoon);
			end.setUTCDate(londonNoon.getUTCDate() + 7);
			dateFrom = todayStr;
			dateTo = end.toISOString().split('T')[0];
		}
	},

	setTimePreset(from: number, to: number) {
		timeFrom = from;
		timeTo = to;
	},

	clearTimeRange() {
		timeFrom = null;
		timeTo = null;
	}
};
