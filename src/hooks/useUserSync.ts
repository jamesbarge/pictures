"use client";

/**
 * useUserSync Hook
 * Unified sync lifecycle manager for all user data:
 * - Film statuses (watchlist, seen, not interested)
 * - User preferences (cinemas, view settings)
 * - Filter settings
 * - Festival follows and schedule
 *
 * Features:
 * - Initial sync on sign-in
 * - Debounced sync on store changes
 * - Online/offline awareness
 * - Anonymous-to-authenticated tracking
 */

import { useEffect, useRef, useCallback } from "react";
import { useUser } from "@/hooks/useClerkSafe";
import { useFilmStatus } from "@/stores/film-status";
import { usePreferences } from "@/stores/preferences";
import { useFilters } from "@/stores/filters";
import { useFestivalStore } from "@/stores/festival";
import {
  performFullSync,
  pushFilmStatuses,
  pushPreferences,
} from "@/lib/sync/user-sync-service";
import {
  performFestivalSync,
  pushFestivalFollows,
  pushFestivalSchedule,
} from "@/lib/sync/festival-sync-service";
import {
  trackUserAuthenticated,
  trackAnonymousToAuthenticated,
  getDistinctId,
} from "@/lib/analytics";

// Debounce delay for sync (500ms)
const SYNC_DEBOUNCE_MS = 500;

// Store anonymous ID before sign-in (survives re-renders)
let storedAnonymousId: string | null = null;

export function useUserSync() {
  const { isSignedIn, isLoaded } = useUser();

  // Debounce refs for all sync operations
  const filmStatusDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const preferencesDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const followsDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const scheduleDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const isSyncingRef = useRef(false);
  const initialSyncPerformedRef = useRef(false);

  // ============================================================================
  // Debounced push functions
  // ============================================================================

  const debouncedPushFilmStatuses = useCallback(() => {
    if (filmStatusDebounceRef.current) {
      clearTimeout(filmStatusDebounceRef.current);
    }
    filmStatusDebounceRef.current = setTimeout(() => {
      if (!isSyncingRef.current) {
        pushFilmStatuses();
      }
    }, SYNC_DEBOUNCE_MS);
  }, []);

  const debouncedPushPreferences = useCallback(() => {
    if (preferencesDebounceRef.current) {
      clearTimeout(preferencesDebounceRef.current);
    }
    preferencesDebounceRef.current = setTimeout(() => {
      if (!isSyncingRef.current) {
        pushPreferences();
      }
    }, SYNC_DEBOUNCE_MS);
  }, []);

  const debouncedPushFollows = useCallback(() => {
    if (followsDebounceRef.current) {
      clearTimeout(followsDebounceRef.current);
    }
    followsDebounceRef.current = setTimeout(() => {
      if (!isSyncingRef.current) {
        pushFestivalFollows();
      }
    }, SYNC_DEBOUNCE_MS);
  }, []);

  const debouncedPushSchedule = useCallback(() => {
    if (scheduleDebounceRef.current) {
      clearTimeout(scheduleDebounceRef.current);
    }
    scheduleDebounceRef.current = setTimeout(() => {
      if (!isSyncingRef.current) {
        pushFestivalSchedule();
      }
    }, SYNC_DEBOUNCE_MS);
  }, []);

  // ============================================================================
  // Anonymous ID capture (for conversion tracking)
  // ============================================================================

  useEffect(() => {
    if (!isLoaded) return;

    // Store the anonymous ID when not signed in
    if (!isSignedIn && !storedAnonymousId) {
      storedAnonymousId = getDistinctId() || null;
      if (storedAnonymousId) {
        console.log("[Sync] Captured anonymous ID:", storedAnonymousId.slice(0, 8) + "...");
      }
    }
  }, [isLoaded, isSignedIn]);

  // ============================================================================
  // Initial sync on sign-in
  // ============================================================================

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && !initialSyncPerformedRef.current) {
      console.log("[Sync] User signed in, performing initial sync...");
      isSyncingRef.current = true;
      initialSyncPerformedRef.current = true;

      // Perform both user data and festival syncs in parallel
      Promise.all([
        performFullSync("sign_in"),
        performFestivalSync(),
      ]).then(([userSyncSuccess]) => {
        isSyncingRef.current = false;

        // Track anonymous-to-authenticated conversion
        if (userSyncSuccess && storedAnonymousId) {
          const currentId = getDistinctId();

          // Only alias if the IDs are different (user was anonymous before)
          if (currentId && storedAnonymousId !== currentId) {
            // Check if user had any pre-signup activity
            const filmCount = Object.keys(useFilmStatus.getState().getAllFilms()).length;
            const hadAnonymousActivity = filmCount > 0;

            trackAnonymousToAuthenticated(storedAnonymousId, currentId, filmCount);
            trackUserAuthenticated(currentId, false, hadAnonymousActivity);

            console.log("[Sync] Linked anonymous activity:", {
              anonymousId: storedAnonymousId.slice(0, 8) + "...",
              userId: currentId.slice(0, 8) + "...",
              filmsBeforeSignup: filmCount,
            });
          }

          // Clear stored anonymous ID
          storedAnonymousId = null;
        }
      }).catch((error) => {
        isSyncingRef.current = false;
        console.error("[Sync] Initial sync failed:", error);
      });
    }

    // Reset flag on sign-out so next sign-in triggers sync
    if (!isSignedIn) {
      initialSyncPerformedRef.current = false;
    }
  }, [isSignedIn, isLoaded]);

  // ============================================================================
  // Store subscriptions
  // ============================================================================

  // Subscribe to film status changes
  useEffect(() => {
    if (!isSignedIn) return;

    const unsubscribe = useFilmStatus.subscribe((state, prevState) => {
      // Only trigger sync if films actually changed
      if (state.films !== prevState.films) {
        debouncedPushFilmStatuses();
      }
    });

    return () => {
      unsubscribe();
      if (filmStatusDebounceRef.current) {
        clearTimeout(filmStatusDebounceRef.current);
      }
    };
  }, [isSignedIn, debouncedPushFilmStatuses]);

  // Subscribe to preferences and filter changes
  useEffect(() => {
    if (!isSignedIn) return;

    const unsubscribePrefs = usePreferences.subscribe((state, prevState) => {
      // Check if any preference changed (excluding functions)
      const changed =
        state.selectedCinemas !== prevState.selectedCinemas ||
        state.defaultView !== prevState.defaultView ||
        state.showRepertoryOnly !== prevState.showRepertoryOnly ||
        state.hidePastScreenings !== prevState.hidePastScreenings ||
        state.defaultDateRange !== prevState.defaultDateRange ||
        state.preferredFormats !== prevState.preferredFormats;

      if (changed) {
        debouncedPushPreferences();
      }
    });

    const unsubscribeFilters = useFilters.subscribe((state, prevState) => {
      // Check if any persisted filter changed
      const changed =
        state.cinemaIds !== prevState.cinemaIds ||
        state.formats !== prevState.formats ||
        state.programmingTypes !== prevState.programmingTypes ||
        state.decades !== prevState.decades ||
        state.genres !== prevState.genres ||
        state.timesOfDay !== prevState.timesOfDay ||
        state.hideSeen !== prevState.hideSeen ||
        state.hideNotInterested !== prevState.hideNotInterested;

      if (changed) {
        debouncedPushPreferences();
      }
    });

    return () => {
      unsubscribePrefs();
      unsubscribeFilters();
      if (preferencesDebounceRef.current) {
        clearTimeout(preferencesDebounceRef.current);
      }
    };
  }, [isSignedIn, debouncedPushPreferences]);

  // Subscribe to festival store changes
  useEffect(() => {
    if (!isSignedIn) return;

    const unsubscribe = useFestivalStore.subscribe((state, prevState) => {
      // Check if follows changed
      if (state.follows !== prevState.follows) {
        debouncedPushFollows();
      }

      // Check if schedule changed
      if (state.schedule !== prevState.schedule) {
        debouncedPushSchedule();
      }
    });

    return () => {
      unsubscribe();
      if (followsDebounceRef.current) {
        clearTimeout(followsDebounceRef.current);
      }
      if (scheduleDebounceRef.current) {
        clearTimeout(scheduleDebounceRef.current);
      }
    };
  }, [isSignedIn, debouncedPushFollows, debouncedPushSchedule]);

  // ============================================================================
  // Online/offline awareness
  // ============================================================================

  useEffect(() => {
    if (!isSignedIn) return;

    const handleOnline = () => {
      console.log("[Sync] Back online, performing sync...");
      // Sync all data when coming back online
      Promise.all([
        performFullSync("manual"),
        performFestivalSync(),
      ]).catch((error) => {
        console.error("[Sync] Online sync failed:", error);
      });
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [isSignedIn]);

  // ============================================================================
  // Cleanup on unmount
  // ============================================================================

  useEffect(() => {
    return () => {
      if (filmStatusDebounceRef.current) {
        clearTimeout(filmStatusDebounceRef.current);
      }
      if (preferencesDebounceRef.current) {
        clearTimeout(preferencesDebounceRef.current);
      }
      if (followsDebounceRef.current) {
        clearTimeout(followsDebounceRef.current);
      }
      if (scheduleDebounceRef.current) {
        clearTimeout(scheduleDebounceRef.current);
      }
    };
  }, []);
}
