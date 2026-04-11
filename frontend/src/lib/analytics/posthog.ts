/**
 * PostHog Analytics — SvelteKit port
 * Centralized analytics tracking for the cinema calendar app
 */

import posthog from 'posthog-js';
import { browser } from '$app/environment';
import { PUBLIC_POSTHOG_KEY } from '$env/static/public';

// Admin emails excluded from all PostHog tracking
const ADMIN_EMAILS = ['jdwbarge@gmail.com'];

export function isAdminEmail(email: string | undefined | null): boolean {
	if (!email) return false;
	return ADMIN_EMAILS.includes(email.toLowerCase());
}

// ── Init ────────────────────────────────────────────────────────

let initialized = false;

export function initPostHog() {
	if (!browser || initialized || !PUBLIC_POSTHOG_KEY) return;

	posthog.init(PUBLIC_POSTHOG_KEY, {
		api_host: '/ingest',
		ui_host: 'https://eu.posthog.com',
		capture_pageview: false, // we track manually on route change
		capture_pageleave: true,
		persistence: 'memory', // upgraded to localStorage+cookie after consent
		cross_subdomain_cookie: false,
		opt_out_capturing_by_default: true, // GDPR: wait for consent
		disable_session_recording: true, // enabled after consent
		session_recording: {
			maskAllInputs: true,
			maskTextSelector: '[data-ph-mask]'
		},
		autocapture: {
			dom_event_allowlist: ['click', 'submit', 'change'],
			element_allowlist: ['button', 'a', 'input', 'select', 'textarea']
		},
		capture_performance: true,
		capture_exceptions: true
	});

	initialized = true;
}

export function trackPageview(url: string) {
	if (!browser || !initialized) return;
	posthog.capture('$pageview', { $current_url: url });
}

// ── Shared Types ────────────────────────────────────────────────

export type DiscoverySource =
	| 'calendar'
	| 'search'
	| 'tonight'
	| 'map'
	| 'watchlist'
	| 'shared_link'
	| 'film_detail';

interface FilmContext {
	filmId: string;
	filmTitle: string;
	filmYear?: number | null;
	isRepertory?: boolean;
	genres?: string[] | null;
	directors?: string[] | null;
}

interface ScreeningContext extends FilmContext {
	screeningId?: string;
	screeningTime?: Date | string;
	cinemaId?: string;
	cinemaName?: string;
	format?: string | null;
	eventType?: string | null;
}

// ── Film Events ─────────────────────────────────────────────────

export function trackFilmView(film: FilmContext, source?: DiscoverySource) {
	if (!browser) return;
	posthog.capture('film_viewed', {
		film_id: film.filmId,
		film_title: film.filmTitle,
		film_year: film.filmYear,
		is_repertory: film.isRepertory,
		genres: film.genres,
		directors: film.directors,
		source
	});
}

export function trackScreeningClick(screening: ScreeningContext, source?: DiscoverySource) {
	if (!browser) return;
	posthog.capture('screening_card_clicked', {
		film_id: screening.filmId,
		film_title: screening.filmTitle,
		screening_id: screening.screeningId,
		screening_time: screening.screeningTime,
		cinema_id: screening.cinemaId,
		cinema_name: screening.cinemaName,
		format: screening.format,
		event_type: screening.eventType,
		is_repertory: screening.isRepertory,
		source
	});
}

export function trackBookingClick(
	screening: ScreeningContext & { bookingUrl: string },
	source?: DiscoverySource,
	isWatchlisted?: boolean
) {
	if (!browser) return;
	posthog.capture('booking_link_clicked', {
		film_id: screening.filmId,
		film_title: screening.filmTitle,
		screening_id: screening.screeningId,
		screening_time: screening.screeningTime,
		cinema_id: screening.cinemaId,
		cinema_name: screening.cinemaName,
		format: screening.format,
		event_type: screening.eventType,
		booking_url: screening.bookingUrl,
		source,
		is_watchlisted: isWatchlisted
	});
}

// ── Watchlist & Status Events ───────────────────────────────────

type FilmStatus = 'want_to_see' | 'seen' | 'not_interested' | null;

export function trackFilmStatusChange(
	film: FilmContext,
	previousStatus: FilmStatus,
	newStatus: FilmStatus
) {
	if (!browser) return;
	posthog.capture('film_status_changed', {
		film_id: film.filmId,
		film_title: film.filmTitle,
		film_year: film.filmYear,
		is_repertory: film.isRepertory,
		previous_status: previousStatus,
		new_status: newStatus
	});
}

// ── Search Events ───────────────────────────────────────────────

export function trackSearch(query: string, resultCount: number) {
	if (!browser) return;
	posthog.capture('search_performed', {
		query,
		query_length: query.length,
		result_count: resultCount
	});
}

export function trackSearchResultClick(query: string, film: FilmContext, resultPosition: number) {
	if (!browser) return;
	posthog.capture('search_result_clicked', {
		query,
		film_id: film.filmId,
		film_title: film.filmTitle,
		result_position: resultPosition
	});
}

// ── Filter Events ───────────────────────────────────────────────

type FilterAction = 'added' | 'removed' | 'set' | 'cleared';

export function trackFilterChange(
	filterType: string,
	value: unknown,
	action: FilterAction,
	context?: string
) {
	if (!browser) return;
	posthog.capture('filter_changed', {
		filter_type: filterType,
		value,
		action,
		...(context && { context })
	});
}

// ── Cinema Events ───────────────────────────────────────────────

export function trackCinemaViewed(cinemaId: string, cinemaName: string, source?: string) {
	if (!browser) return;
	posthog.capture('cinema_viewed', {
		cinema_id: cinemaId,
		cinema_name: cinemaName,
		source
	});
}

// ── Friction Events ─────────────────────────────────────────────

export function trackSearchNoResults(query: string) {
	if (!browser) return;
	posthog.capture('search_no_results', { query, query_length: query.length });
}

export function trackFilterNoResults(activeFilters: Record<string, unknown>) {
	if (!browser) return;
	posthog.capture('filter_no_results', { ...activeFilters });
}

export function trackTonightNoScreenings() {
	if (!browser) return;
	posthog.capture('tonight_no_screenings');
}

// ── Sync Events ─────────────────────────────────────────────────

export type SyncSource = 'sign_in' | 'store_change' | 'manual';

export function trackSyncInitiated(source: SyncSource, itemsToSync: number) {
	if (!browser) return;
	posthog.capture('sync_initiated', { source, items_to_sync: itemsToSync });
}

export function trackSyncCompleted(stats: {
	durationMs: number;
	itemsSynced: number;
	conflictsResolved: number;
}) {
	if (!browser) return;
	posthog.capture('sync_completed', {
		duration_ms: stats.durationMs,
		items_synced: stats.itemsSynced,
		conflicts_resolved: stats.conflictsResolved
	});
}

export function trackSyncFailed(error: string, phase: string) {
	if (!browser) return;
	posthog.capture('sync_failed', { error, phase });
}

// ── User Lifecycle ──────────────────────────────────────────────

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
	if (!browser) return;

	// If admin, opt out entirely to prevent polluting analytics
	const email = properties?.email as string | undefined;
	if (isAdminEmail(email)) {
		posthog.opt_out_capturing();
		posthog.reset();
		return;
	}

	posthog.identify(userId, properties);
}

export function resetUser() {
	if (!browser) return;
	posthog.reset();
}

// ── Calendar & Share Events ─────────────────────────────────────

export function trackCalendarExport(screening: ScreeningContext) {
	if (!browser) return;
	posthog.capture('calendar_export_clicked', {
		film_id: screening.filmId,
		film_title: screening.filmTitle,
		screening_id: screening.screeningId,
		cinema_name: screening.cinemaName
	});
}

// ── Feature Flags ───────────────────────────────────────────────

export function isFeatureEnabled(flagKey: string): boolean {
	if (!browser) return false;
	return posthog.isFeatureEnabled(flagKey) ?? false;
}
