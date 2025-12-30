/**
 * PostHog Analytics Utilities
 * Centralized analytics tracking for the cinema calendar app
 */

import posthog from "posthog-js";

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
  screeningId: string;
  screeningTime: Date | string;
  cinemaId: string;
  cinemaName: string;
  format?: string | null;
  eventType?: string | null;
}

/** Track when a user views a film's detail page */
export function trackFilmView(film: FilmContext) {
  if (typeof window === "undefined") return;
  posthog.capture("film_viewed", {
    film_id: film.filmId,
    film_title: film.filmTitle,
    film_year: film.filmYear,
    is_repertory: film.isRepertory,
    genres: film.genres,
    directors: film.directors,
  });
}

/** Track when a user clicks a screening card */
export function trackScreeningClick(screening: ScreeningContext) {
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
  });
}

/** Track when a user clicks a booking link */
export function trackBookingClick(screening: ScreeningContext & { bookingUrl: string }) {
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
  });
}

// ============================================
// WATCHLIST & STATUS EVENTS
// ============================================

// Must match FilmStatus from film-status store
type FilmStatus = "want_to_see" | "seen" | "not_interested" | null;

/** Track when a user adds/removes a film from watchlist */
export function trackWatchlistChange(
  film: FilmContext,
  action: "added" | "removed"
) {
  if (typeof window === "undefined") return;
  posthog.capture("watchlist_changed", {
    film_id: film.filmId,
    film_title: film.filmTitle,
    film_year: film.filmYear,
    is_repertory: film.isRepertory,
    action,
  });
}

/** Track when a user marks a film as seen */
export function trackFilmMarkedSeen(film: FilmContext) {
  if (typeof window === "undefined") return;
  posthog.capture("film_marked_seen", {
    film_id: film.filmId,
    film_title: film.filmTitle,
    film_year: film.filmYear,
    is_repertory: film.isRepertory,
  });
}

/** Track when a user marks a film as not interested */
export function trackFilmMarkedNotInterested(film: FilmContext) {
  if (typeof window === "undefined") return;
  posthog.capture("film_marked_not_interested", {
    film_id: film.filmId,
    film_title: film.filmTitle,
    film_year: film.filmYear,
    is_repertory: film.isRepertory,
  });
}

/** Track any film status change */
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

/** Track filter changes (already in filters store, but exported for consistency) */
export function trackFilterChange(
  filterType: string,
  value: unknown,
  action: FilterAction
) {
  if (typeof window === "undefined") return;
  posthog.capture("filter_changed", {
    filter_type: filterType,
    value,
    action,
  });
}

// ============================================
// CINEMA EVENTS
// ============================================

/** Track when a user selects/deselects cinemas */
export function trackCinemaSelection(
  cinemaId: string,
  cinemaName: string,
  action: "selected" | "deselected"
) {
  if (typeof window === "undefined") return;
  posthog.capture("cinema_selection_changed", {
    cinema_id: cinemaId,
    cinema_name: cinemaName,
    action,
  });
}

// ============================================
// CONVERSION FUNNEL EVENTS
// ============================================

/**
 * Track funnel steps for conversion analysis
 * Funnel: Browse → View Film → Click Screening → Book
 */
export function trackFunnelStep(
  step: "browse" | "view_film" | "click_screening" | "click_booking",
  context?: Record<string, unknown>
) {
  if (typeof window === "undefined") return;
  posthog.capture(`funnel_${step}`, {
    funnel_name: "browse_to_booking",
    step,
    ...context,
  });
}

// ============================================
// FEATURE FLAGS
// ============================================

/** Check if a feature flag is enabled */
export function isFeatureEnabled(flagKey: string): boolean {
  if (typeof window === "undefined") return false;
  return posthog.isFeatureEnabled(flagKey) ?? false;
}

/** Get feature flag value (for multivariate flags) */
export function getFeatureFlagValue(flagKey: string): string | boolean | undefined {
  if (typeof window === "undefined") return undefined;
  return posthog.getFeatureFlag(flagKey);
}

/** Get feature flag payload (additional data attached to flag) */
export function getFeatureFlagPayload(flagKey: string): unknown {
  if (typeof window === "undefined") return undefined;
  return posthog.getFeatureFlagPayload(flagKey);
}

// ============================================
// USER PROPERTIES
// ============================================

/** Set user properties (persisted across sessions) */
export function setUserProperties(properties: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  posthog.people.set(properties);
}

/** Set user properties once (only if not already set) */
export function setUserPropertiesOnce(properties: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  posthog.people.set_once(properties);
}

/** Increment a numeric user property */
export function incrementUserProperty(property: string, value: number = 1) {
  if (typeof window === "undefined") return;
  // PostHog doesn't have a direct increment - use capture with $set
  // The user property will be updated with the new value
  posthog.capture("$set", {
    $set: { [property]: value },
  });
}

// ============================================
// ERROR TRACKING
// ============================================

/** Manually capture an error/exception */
export function captureError(
  error: Error,
  context?: Record<string, unknown>
) {
  if (typeof window === "undefined") return;
  posthog.capture("$exception", {
    $exception_message: error.message,
    $exception_type: error.name,
    $exception_stack_trace_raw: error.stack,
    ...context,
  });
}

// ============================================
// TIMING & PERFORMANCE
// ============================================

/** Track a timing metric */
export function trackTiming(
  category: string,
  variable: string,
  durationMs: number
) {
  if (typeof window === "undefined") return;
  posthog.capture("timing", {
    timing_category: category,
    timing_variable: variable,
    timing_value: durationMs,
  });
}

/** Create a timer that tracks duration when stopped */
export function startTimer(category: string, variable: string) {
  const startTime = performance.now();
  return {
    stop: () => {
      const duration = performance.now() - startTime;
      trackTiming(category, variable, Math.round(duration));
      return duration;
    },
  };
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

export interface UserEngagementData {
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
