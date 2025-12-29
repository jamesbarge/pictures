"use client";

/**
 * useUserFestivals Hook
 * Manages sync lifecycle for festival follows and schedule between localStorage and server
 * - Initial sync on sign-in
 * - Debounced sync on store changes
 * - Online/offline awareness
 */

import { useEffect, useRef, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { useFestivalStore } from "@/stores/festival";
import {
  performFestivalSync,
  pushFestivalFollows,
  pushFestivalSchedule,
} from "@/lib/sync/festival-sync-service";

// Debounce delay for sync (500ms)
const SYNC_DEBOUNCE_MS = 500;

export function useUserFestivals() {
  const { isSignedIn, isLoaded } = useUser();
  const followsDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const scheduleDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);
  const initialSyncPerformedRef = useRef(false);

  // Debounced follows push
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

  // Debounced schedule push
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

  // Initial sync on sign-in
  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && !initialSyncPerformedRef.current) {
      console.log("[FestivalSync] User signed in, performing initial sync...");
      isSyncingRef.current = true;
      initialSyncPerformedRef.current = true;

      performFestivalSync().finally(() => {
        isSyncingRef.current = false;
      });
    }

    // Reset flag on sign-out so next sign-in triggers sync
    if (!isSignedIn) {
      initialSyncPerformedRef.current = false;
    }
  }, [isSignedIn, isLoaded]);

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

  // Online/offline awareness - sync when coming back online
  useEffect(() => {
    if (!isSignedIn) return;

    const handleOnline = () => {
      console.log("[FestivalSync] Back online, performing sync...");
      performFestivalSync();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [isSignedIn]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (followsDebounceRef.current) {
        clearTimeout(followsDebounceRef.current);
      }
      if (scheduleDebounceRef.current) {
        clearTimeout(scheduleDebounceRef.current);
      }
    };
  }, []);
}
