/**
 * Sync orchestrator — bridges localStorage stores with the backend API
 * when a user is signed in via Clerk.
 */

import { apiGet, apiPut, apiPost, apiDelete } from '$lib/api/client';
import { filmStatuses } from './film-status.svelte';
import { debounce } from '$lib/utils';

type FilmStatusValue = 'want_to_see' | 'seen' | 'not_interested';

interface ServerFilmStatus {
	filmId: string;
	status: FilmStatusValue;
	updatedAt?: string;
}

interface ServerPreferences {
	theme?: string;
	viewMode?: string;
}

// ── State ────────────────────────────────────────────────────────

let _getToken: (() => Promise<string | null>) | null = null;
let _syncing = $state(false);
let _lastSyncAt = $state<string | null>(null);
let _syncError = $state<string | null>(null);

export const syncState = {
	get syncing() { return _syncing; },
	get lastSyncAt() { return _lastSyncAt; },
	get syncError() { return _syncError; },
};

// ── Init / Teardown ──────────────────────────────────────────────

export function initSync(getToken: () => Promise<string | null>) {
	_getToken = getToken;
	pullFromServer();
}

export function stopSync() {
	_getToken = null;
}

// ── Pull: Server → Local ─────────────────────────────────────────

async function pullFromServer() {
	if (!_getToken) return;

	const token = await _getToken();
	if (!token) return;

	_syncing = true;
	_syncError = null;

	try {
		const serverStatuses = await apiGet<ServerFilmStatus[]>('/api/user/film-statuses', { token });

		// Merge: server wins (we trust server as source of truth on first pull)
		for (const s of serverStatuses) {
			const local = filmStatuses.getStatus(s.filmId);
			if (!local) {
				filmStatuses.setStatus(s.filmId, s.status);
			}
		}

		_lastSyncAt = new Date().toISOString();
	} catch (e) {
		_syncError = e instanceof Error ? e.message : 'Sync failed';
		console.error('[sync] Pull failed:', _syncError);
	} finally {
		_syncing = false;
	}
}

// ── Push: Local → Server ─────────────────────────────────────────

export async function pushFilmStatus(filmId: string, status: FilmStatusValue | null) {
	if (!_getToken) return;

	const token = await _getToken();
	if (!token) return;

	try {
		if (status === null) {
			await apiDelete(`/api/user/film-statuses/${filmId}`, { token });
		} else {
			await apiPut(`/api/user/film-statuses/${filmId}`, { status }, { token });
		}
	} catch (e) {
		console.error('[sync] Push film status failed:', e instanceof Error ? e.message : e);
	}
}

export const debouncedPushPreferences = debounce(async (prefs: ServerPreferences) => {
	if (!_getToken) return;

	const token = await _getToken();
	if (!token) return;

	try {
		await apiPut('/api/user/preferences', prefs, { token });
	} catch (e) {
		console.error('[sync] Push preferences failed:', e instanceof Error ? e.message : e);
	}
}, 1000);
