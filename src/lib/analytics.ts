/**
 * PostHog Analytics Utilities
 * Centralized analytics tracking for the cinema calendar app
 */

import posthog from "posthog-js";

// ============================================
// SHARED TYPES
// ============================================

export type DiscoverySource = "calendar" | "search" | "tonight" | "map" | "watchlist" | "shared_link" | "film_detail";

// ============================================
// FILM EVENTS
// ============================================

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

/** Track when a user views a film's detail page */
export function trackFilmView(film: FilmContext, source?: DiscoverySource) {
  if (typeof window === "undefined") return;
  posthog.capture("film_viewed", {
    film_id: film.filmId,
    film_title: film.filmTitle,
    film_year: film.filmYear,
    is_repertory: film.isRepertory,
    genres: film.genres,
    directors: film.directors,
    source,
  });
}

/** Track when a user clicks a screening card */
export function trackScreeningClick(screening: ScreeningContext, source?: DiscoverySource) {
  if (typeof window === "undefined") return;
  posthog.capture("screening_card_clicked", {
    film_id: screening.filmId,
    film_title: screening.filmTitle,
    film_year: screening.filmYear,
    screening_id: screening.screeningId,
    screening_time: screening.screeningTime,
    cinema_id: screening.cinemaId,
    cinema_name: screening.cinemaName,
    format: screening.format,
    event_type: screening.eventType,
    is_repertory: screening.isRepertory,
    source,
  });
}

/** Track when a user clicks a booking link */
export function trackBookingClick(
  screening: ScreeningContext & { bookingUrl: string },
  source?: DiscoverySource,
  isWatchlisted?: boolean
) {
  if (typeof window === "undefined") return;
  posthog.capture("booking_link_clicked", {
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
    is_watchlisted: isWatchlisted,
  });
}

// ============================================
// WATCHLIST & STATUS EVENTS
// ============================================

// Must match FilmStatus from film-status store
type FilmStatus = "want_to_see" | "seen" | "not_interested" | null;

/** Track any film status change (single canonical event for all status transitions) */
export function trackFilmStatusChange(
  film: FilmContext,
  previousStatus: FilmStatus,
  newStatus: FilmStatus
) {
  if (typeof window === "undefined") return;
  posthog.capture("film_status_changed", {
    film_id: film.filmId,
    film_title: film.filmTitle,
    film_year: film.filmYear,
    is_repertory: film.isRepertory,
    previous_status: previousStatus,
    new_status: newStatus,
  });
}

// ============================================
// SEARCH EVENTS
// ============================================

/** Track when a user performs a search */
export function trackSearch(query: string, resultCount: number) {
  if (typeof window === "undefined") return;
  posthog.capture("search_performed", {
    query,
    query_length: query.length,
    result_count: resultCount,
  });
}

/** Track when a user selects a search result */
export function trackSearchResultClick(
  query: string,
  film: FilmContext,
  resultPosition: number
) {
  if (typeof window === "undefined") return;
  posthog.capture("search_result_clicked", {
    query,
    film_id: film.filmId,
    film_title: film.filmTitle,
    result_position: resultPosition,
  });
}

// ============================================
// FILTER EVENTS
// ============================================

type FilterAction = "added" | "removed" | "set" | "cleared";

/** Track filter changes with optional context for where the filter was applied */
export function trackFilterChange(
  filterType: string,
  value: unknown,
  action: FilterAction,
  context?: string
) {
  if (typeof window === "undefined") return;
  posthog.capture("filter_changed", {
    filter_type: filterType,
    value,
    action,
    ...(context && { context }),
  });
}

// ============================================
// CINEMA EVENTS
// ============================================

/** Track when a user views a cinema page or clicks a cinema link */
export function trackCinemaViewed(cinemaId: string, cinemaName: string, source?: string) {
  if (typeof window === "undefined") return;
  posthog.capture("cinema_viewed", {
    cinema_id: cinemaId,
    cinema_name: cinemaName,
    source,
  });
}

// ============================================
// EMPTY STATE / FRICTION EVENTS
// ============================================

/** Track when a search returns no results */
export function trackSearchNoResults(query: string) {
  if (typeof window === "undefined") return;
  posthog.capture("search_no_results", {
    query,
    query_length: query.length,
  });
}

/** Track when active filters produce an empty calendar */
export function trackFilterNoResults(activeFilters: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  posthog.capture("filter_no_results", {
    ...activeFilters,
  });
}

/** Track when tonight page has no screenings */
export function trackTonightNoScreenings() {
  if (typeof window === "undefined") return;
  posthog.capture("tonight_no_screenings");
}

// ============================================
// FEATURE FLAGS
// ============================================

/** Check if a feature flag is enabled */
export function isFeatureEnabled(flagKey: string): boolean {
  if (typeof window === "undefined") return false;
  return posthog.isFeatureEnabled(flagKey) ?? false;
}

// ============================================
// SYNC LIFECYCLE EVENTS
// ============================================

export type SyncSource = "sign_in" | "store_change" | "manual";

export interface SyncStats {
  durationMs: number;
  itemsSynced: number;
  conflictsResolved: number;
  serverWins: number;
  clientWins: number;
  isNewUser: boolean;
}

/** Track when a sync operation starts */
export function trackSyncInitiated(source: SyncSource, itemsToSync: number) {
  if (typeof window === "undefined") return;
  posthog.capture("sync_initiated", {
    source,
    items_to_sync: itemsToSync,
  });
}

/** Track when a sync operation completes successfully */
export function trackSyncCompleted(stats: SyncStats) {
  if (typeof window === "undefined") return;
  posthog.capture("sync_completed", {
    duration_ms: stats.durationMs,
    items_synced: stats.itemsSynced,
    conflicts_resolved: stats.conflictsResolved,
    server_wins: stats.serverWins,
    client_wins: stats.clientWins,
    is_new_user: stats.isNewUser,
  });
}

/** Track when a sync operation fails */
export function trackSyncFailed(error: string, phase: string) {
  if (typeof window === "undefined") return;
  posthog.capture("sync_failed", {
    error,
    phase,
  });
}

// ============================================
// USER LIFECYCLE EVENTS
// ============================================

/** Track when a user authenticates (sign-in completes) */
export function trackUserAuthenticated(
  userId: string,
  isNewUser: boolean,
  hadAnonymousActivity: boolean
) {
  if (typeof window === "undefined") return;
  posthog.capture("user_authenticated", {
    user_id: userId,
    is_new_user: isNewUser,
    had_anonymous_activity: hadAnonymousActivity,
  });
}

/** Track anonymous to authenticated user correlation */
export function trackAnonymousToAuthenticated(
  anonymousId: string,
  userId: string,
  eventsBeforeSignup: number
) {
  if (typeof window === "undefined") return;

  // Alias links the anonymous ID to the authenticated user
  posthog.alias(anonymousId, userId);

  posthog.capture("anonymous_to_authenticated", {
    anonymous_id: anonymousId,
    user_id: userId,
    events_before_signup: eventsBeforeSignup,
  });
}

/** Get the current PostHog distinct ID (anonymous ID before sign-in) */
export function getDistinctId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return posthog.get_distinct_id();
}

// ============================================
// USER ENGAGEMENT PROPERTIES
// ============================================

interface UserEngagementData {
  watchlistCount: number;
  seenCount: number;
  notInterestedCount: number;
  totalStatuses: number;
  favoriteCinemas: string[];
  lastSyncAt: string;
  firstFilmAddedAt?: string | null;
}

/** Sync user engagement properties to PostHog after a successful sync */
export function syncUserEngagementProperties(data: UserEngagementData) {
  if (typeof window === "undefined") return;

  posthog.people.set({
    watchlist_count: data.watchlistCount,
    seen_count: data.seenCount,
    not_interested_count: data.notInterestedCount,
    total_statuses: data.totalStatuses,
    favorite_cinemas: data.favoriteCinemas,
    last_sync_at: data.lastSyncAt,
  });

  // Only set first_film_added_at once (never overwrite)
  if (data.firstFilmAddedAt) {
    posthog.people.set_once({
      first_film_added_at: data.firstFilmAddedAt,
    });
  }
}
