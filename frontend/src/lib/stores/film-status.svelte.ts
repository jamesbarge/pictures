import { browser } from '$app/environment';
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
		const now = new Date().toISOString();
		statuses = {
			...statuses,
			[filmId]: {
				status,
				addedAt: statuses[filmId]?.addedAt ?? now,
				updatedAt: now
			}
		};
	},

	toggleStatus(filmId: string, status: FilmStatus) {
		if (statuses[filmId]?.status === status) {
			const { [filmId]: _, ...rest } = statuses;
			statuses = rest;
		} else {
			this.setStatus(filmId, status);
		}
	},

	removeStatus(filmId: string) {
		const { [filmId]: _, ...rest } = statuses;
		statuses = rest;
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
