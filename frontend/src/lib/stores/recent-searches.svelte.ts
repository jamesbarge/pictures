import { browser } from '$app/environment';

const STORAGE_KEY = 'pictures-recent-searches';
const MAX_ENTRIES = 5;

function load(): string[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((q): q is string => typeof q === 'string').slice(0, MAX_ENTRIES);
	} catch {
		return [];
	}
}

let entries = $state<string[]>(load());

function persist() {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
	} catch {
		/* ignore quota / private mode */
	}
}

export const recentSearches = {
	get entries() {
		return entries;
	},

	add(query: string) {
		const trimmed = query.trim();
		if (trimmed.length < 2) return;
		const next = [trimmed, ...entries.filter((q) => q.toLowerCase() !== trimmed.toLowerCase())];
		entries = next.slice(0, MAX_ENTRIES);
		persist();
	},

	remove(query: string) {
		entries = entries.filter((q) => q !== query);
		persist();
	},

	clear() {
		entries = [];
		persist();
	}
};
