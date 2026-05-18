import { browser } from '$app/environment';
import { pushFilmStatus } from './sync.svelte';
import type { FilmStatus } from '$lib/types';

const STORAGE_KEY = 'pictures-film-status';

interface FilmStatusEntry {
	status: FilmStatus;
	addedAt: string;
	updatedAt: string;
}

function loadStatuses(): Record<string, FilmStatusEntry> {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

let statuses = $state<Record<string, FilmStatusEntry>>(loadStatuses());

// Shared write path for `setStatus` (with server push) and `setStatusLocal`
// (pull-from-server, no push). Both must preserve `addedAt` on existing rows
// and stamp a fresh `updatedAt` — keeping it in one helper means future schema
// changes only touch one place.
function writeStatusLocally(filmId: string, status: FilmStatus) {
	const now = new Date().toISOString();
	statuses = {
		...statuses,
		[filmId]: {
			status,
			addedAt: statuses[filmId]?.addedAt ?? now,
			updatedAt: now
		}
	};
}

if (browser) {
	$effect.root(() => {
		$effect(() => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses));
		});
	});
}

export const filmStatuses = {
	get all() { return statuses; },

	getStatus(filmId: string): FilmStatus | null {
		return statuses[filmId]?.status ?? null;
	},

	setStatus(filmId: string, status: FilmStatus) {
		writeStatusLocally(filmId, status);
		pushFilmStatus(filmId, status);
	},

	/** Update localStorage only — no server push. Used during pull-from-server to avoid feedback loops. */
	setStatusLocal(filmId: string, status: FilmStatus) {
		writeStatusLocally(filmId, status);
	},

	toggleStatus(filmId: string, status: FilmStatus) {
		if (statuses[filmId]?.status === status) {
			const { [filmId]: _, ...rest } = statuses;
			statuses = rest;
			pushFilmStatus(filmId, null);
		} else {
			this.setStatus(filmId, status);
		}
	},

	removeStatus(filmId: string) {
		const { [filmId]: _, ...rest } = statuses;
		statuses = rest;
		pushFilmStatus(filmId, null);
	},

	getFilmIdsByStatus(status: FilmStatus): string[] {
		return Object.entries(statuses)
			.filter(([, entry]) => entry.status === status)
			.map(([id]) => id);
	},

	get wantToSeeCount(): number {
		return Object.values(statuses).filter((e) => e.status === 'want_to_see').length;
	},

	clearAll() {
		statuses = {};
	}
};
