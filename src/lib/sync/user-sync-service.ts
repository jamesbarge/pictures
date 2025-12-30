/**
 * User Sync Service
 * Handles bidirectional sync between localStorage and server
 * Strategy: localStorage is fast cache, server is source of truth
 * Conflict resolution: timestamp-based, newest wins
 */

import { useFilmStatus, type FilmStatusEntry } from "@/stores/film-status";
import { usePreferences } from "@/stores/preferences";
import { useFilters, type PersistedFilters } from "@/stores/filters";
import type { StoredPreferences, StoredFilters } from "@/db/schema/user-preferences";
import {
  trackSyncInitiated,
  trackSyncCompleted,
  trackSyncFailed,
  syncUserEngagementProperties,
  type SyncSource,
  type SyncStats,
} from "@/lib/analytics";

interface SyncResponse {
  success: boolean;
  isNewUser?: boolean;
  filmStatuses: Record<string, FilmStatusEntry>;
  preferences: StoredPreferences | null;
  persistedFilters: StoredFilters | null;
  preferencesUpdatedAt: string | null;
}

/**
 * Transform local preferences to server format
 */
function preferencesToServerFormat(): StoredPreferences {
  const prefs = usePreferences.getState();
  return {
    selectedCinemas: prefs.selectedCinemas,
    defaultView: prefs.defaultView,
    showRepertoryOnly: prefs.showRepertoryOnly,
    hidePastScreenings: prefs.hidePastScreenings,
    defaultDateRange: prefs.defaultDateRange,
    preferredFormats: prefs.preferredFormats,
  };
}

/**
 * Transform local filters to server format
 */
function filtersToServerFormat(): StoredFilters {
  const filters = useFilters.getState();
  return {
    cinemaIds: filters.cinemaIds,
    formats: filters.formats,
    programmingTypes: filters.programmingTypes,
    decades: filters.decades,
    genres: filters.genres,
    timesOfDay: filters.timesOfDay,
    hideSeen: filters.hideSeen,
    hideNotInterested: filters.hideNotInterested,
  };
}

/**
 * Transform local film statuses to API format
 */
function filmStatusesToApiFormat() {
  const films = useFilmStatus.getState().getAllFilms();
  return Object.entries(films)
    // Filter out entries with null status (shouldn't happen but be defensive)
    .filter(([, entry]) => entry.status != null)
    .map(([filmId, entry]) => ({
      filmId,
      status: entry.status!,
      addedAt: entry.addedAt,
      seenAt: entry.seenAt || null,
      rating: entry.rating || null,
      notes: entry.notes || null,
      filmTitle: entry.filmTitle || null,
      filmYear: entry.filmYear || null,
      filmDirectors: entry.filmDirectors || null,
      filmPosterUrl: entry.filmPosterUrl || null,
      // Default to addedAt if updatedAt is missing (legacy data migration)
      updatedAt: entry.updatedAt || entry.addedAt,
    }));
}

/**
 * Get the most recent updatedAt from preferences or filters
 */
function getPreferencesUpdatedAt(): string {
  const prefsTime = new Date(usePreferences.getState().updatedAt).getTime();
  const filtersTime = new Date(useFilters.getState().updatedAt).getTime();
  return prefsTime > filtersTime
    ? usePreferences.getState().updatedAt
    : useFilters.getState().updatedAt;
}

/**
 * Perform full bidirectional sync with server
 * 1. Send local state to server
 * 2. Server merges and returns merged state
 * 3. Apply merged state to local stores
 *
 * @param source - What triggered this sync (for analytics)
 */
export async function performFullSync(source: SyncSource = "manual"): Promise<boolean> {
  const startTime = performance.now();
  const localStatuses = filmStatusesToApiFormat();

  // Track sync initiation
  trackSyncInitiated(source, localStatuses.length);

  try {
    const response = await fetch("/api/user/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filmStatuses: localStatuses,
        preferences: preferencesToServerFormat(),
        persistedFilters: filtersToServerFormat(),
        preferencesUpdatedAt: getPreferencesUpdatedAt(),
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        // User is not authenticated - don't throw, just return
        console.log("[Sync] User not authenticated, skipping sync");
        return false;
      }
      trackSyncFailed(`HTTP ${response.status}`, "fetch");
      throw new Error(`Sync failed: ${response.status}`);
    }

    const data: SyncResponse = await response.json();

    // Track conflicts resolved
    const serverStatusCount = Object.keys(data.filmStatuses || {}).length;
    const localStatusCount = localStatuses.length;
    const conflictsResolved = Math.min(serverStatusCount, localStatusCount);

    // Apply merged film statuses
    if (data.filmStatuses) {
      // Transform API response to local format (ensure updatedAt exists)
      const transformed: Record<string, FilmStatusEntry> = {};
      for (const [filmId, entry] of Object.entries(data.filmStatuses)) {
        transformed[filmId] = {
          ...entry,
          updatedAt: entry.updatedAt || new Date().toISOString(),
        };
      }
      useFilmStatus.getState().bulkSet(transformed);
    }

    // Apply merged preferences
    if (data.preferences) {
      usePreferences.getState().bulkSet({
        ...data.preferences,
        updatedAt: data.preferencesUpdatedAt || new Date().toISOString(),
      });
    }

    // Apply merged filters
    if (data.persistedFilters) {
      useFilters.getState().bulkSetPersisted({
        ...data.persistedFilters,
        updatedAt: data.preferencesUpdatedAt || new Date().toISOString(),
      });
    }

    const durationMs = Math.round(performance.now() - startTime);

    // Track sync completion
    const syncStats: SyncStats = {
      durationMs,
      itemsSynced: serverStatusCount,
      conflictsResolved,
      serverWins: 0, // Would need to track in API for accuracy
      clientWins: 0,
      isNewUser: data.isNewUser || false,
    };
    trackSyncCompleted(syncStats);

    // Sync user engagement properties to PostHog
    syncUserEngagementPropertiesToPostHog(data.filmStatuses || {});

    console.log("[Sync] Full sync completed successfully in", durationMs, "ms");
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    trackSyncFailed(errorMessage, "sync");
    console.error("[Sync] Full sync failed:", error);
    return false;
  }
}

/**
 * Aggregate and sync user engagement properties to PostHog
 */
function syncUserEngagementPropertiesToPostHog(
  filmStatuses: Record<string, FilmStatusEntry>
): void {
  const entries = Object.values(filmStatuses);

  // Count by status
  const watchlistCount = entries.filter((e) => e.status === "want_to_see").length;
  const seenCount = entries.filter((e) => e.status === "seen").length;
  const notInterestedCount = entries.filter((e) => e.status === "not_interested").length;

  // Find first film added date
  const addedDates = entries
    .map((e) => e.addedAt)
    .filter(Boolean)
    .sort();
  const firstFilmAddedAt = addedDates[0] || null;

  // Get favorite cinemas from preferences
  const favoriteCinemas = usePreferences.getState().selectedCinemas || [];

  syncUserEngagementProperties({
    watchlistCount,
    seenCount,
    notInterestedCount,
    totalStatuses: entries.length,
    favoriteCinemas,
    lastSyncAt: new Date().toISOString(),
    firstFilmAddedAt,
  });
}

/**
 * Push only film status changes to server (for debounced updates)
 */
export async function pushFilmStatuses(): Promise<boolean> {
  try {
    const response = await fetch("/api/user/film-statuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statuses: filmStatusesToApiFormat(),
      }),
    });

    if (!response.ok) {
      if (response.status === 401) return false;
      throw new Error(`Film status sync failed: ${response.status}`);
    }

    console.log("[Sync] Film statuses pushed successfully");
    return true;
  } catch (error) {
    console.error("[Sync] Film status push failed:", error);
    return false;
  }
}

/**
 * Push only preferences to server (for debounced updates)
 */
export async function pushPreferences(): Promise<boolean> {
  try {
    const response = await fetch("/api/user/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences: preferencesToServerFormat(),
        persistedFilters: filtersToServerFormat(),
        updatedAt: getPreferencesUpdatedAt(),
      }),
    });

    if (!response.ok) {
      if (response.status === 401) return false;
      throw new Error(`Preferences sync failed: ${response.status}`);
    }

    console.log("[Sync] Preferences pushed successfully");
    return true;
  } catch (error) {
    console.error("[Sync] Preferences push failed:", error);
    return false;
  }
}

/**
 * Update a single film status on server
 */
export async function pushSingleFilmStatus(filmId: string): Promise<boolean> {
  const films = useFilmStatus.getState().getAllFilms();
  const entry = films[filmId];

  if (!entry) return false;

  try {
    const response = await fetch(`/api/user/film-statuses/${encodeURIComponent(filmId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: entry.status,
        addedAt: entry.addedAt,
        seenAt: entry.seenAt || null,
        rating: entry.rating || null,
        notes: entry.notes || null,
        filmTitle: entry.filmTitle || null,
        filmYear: entry.filmYear || null,
        filmDirectors: entry.filmDirectors || null,
        filmPosterUrl: entry.filmPosterUrl || null,
        updatedAt: entry.updatedAt,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) return false;
      throw new Error(`Single film status sync failed: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error("[Sync] Single film status push failed:", error);
    return false;
  }
}

/**
 * Delete a film status from server
 */
export async function deleteFilmStatus(filmId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/user/film-statuses/${encodeURIComponent(filmId)}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      if (response.status === 401) return false;
      throw new Error(`Film status delete failed: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error("[Sync] Film status delete failed:", error);
    return false;
  }
}
