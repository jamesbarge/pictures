/**
 * Reachable Cinemas Store
 * Manages state for the "What Can I Catch?" feature
 *
 * Calculates which screenings a user can reach based on:
 * - Their location (via postcode)
 * - When they need to be finished by
 * - Travel mode (transit/walking/cycling)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import posthog from "posthog-js";

export type TravelMode = "transit" | "walking" | "bicycling";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface ReachableState {
  // User inputs
  postcode: string;
  coordinates: Coordinates | null;
  finishedByTime: Date | null;
  travelMode: TravelMode;

  // Computed travel times (cinemaId → { minutes, mode })
  travelTimes: Record<string, { minutes: number; mode: string }>;
  lastCalculatedAt: string | null;  // ISO timestamp

  // Loading/error state
  isCalculating: boolean;
  error: string | null;
}

interface ReachableActions {
  // Setters
  setPostcode: (postcode: string) => void;
  setCoordinates: (coords: Coordinates | null) => void;
  setFinishedByTime: (time: Date | null) => void;
  setTravelMode: (mode: TravelMode) => void;

  // Travel time management
  setTravelTimes: (times: Record<string, { minutes: number; mode: string }>) => void;
  setCalculating: (calculating: boolean) => void;
  setError: (error: string | null) => void;

  // Computed helpers
  getTravelTimeForCinema: (cinemaId: string) => number | null;
  hasValidInputs: () => boolean;

  // Reset
  clear: () => void;
  clearResults: () => void;
}

const initialState: ReachableState = {
  postcode: "",
  coordinates: null,
  finishedByTime: null,
  travelMode: "transit",
  travelTimes: {},
  lastCalculatedAt: null,
  isCalculating: false,
  error: null,
};

export const useReachable = create<ReachableState & ReachableActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setPostcode: (postcode) => {
        set({ postcode, error: null });
        // Clear travel times when postcode changes (will need recalculation)
        if (get().coordinates) {
          set({ travelTimes: {}, lastCalculatedAt: null });
        }
      },

      setCoordinates: (coordinates) => {
        set({ coordinates, error: null });
        // Track when user sets a valid location
        if (coordinates && typeof window !== "undefined") {
          posthog.capture("reachable_location_set", {
            postcode: get().postcode,
          });
        }
      },

      setFinishedByTime: (finishedByTime) => {
        set({ finishedByTime });
        if (finishedByTime && typeof window !== "undefined") {
          posthog.capture("reachable_deadline_set", {
            hour: finishedByTime.getHours(),
          });
        }
      },

      setTravelMode: (travelMode) => {
        const previousMode = get().travelMode;
        set({ travelMode });

        // Clear travel times when mode changes (need recalculation)
        if (previousMode !== travelMode) {
          set({ travelTimes: {}, lastCalculatedAt: null });

          if (typeof window !== "undefined") {
            posthog.capture("reachable_mode_changed", {
              from: previousMode,
              to: travelMode,
            });
          }
        }
      },

      setTravelTimes: (travelTimes) => {
        set({
          travelTimes,
          lastCalculatedAt: new Date().toISOString(),
          isCalculating: false,
          error: null,
        });

        if (typeof window !== "undefined") {
          posthog.capture("reachable_times_calculated", {
            cinema_count: Object.keys(travelTimes).length,
          });
        }
      },

      setCalculating: (isCalculating) => {
        set({ isCalculating });
      },

      setError: (error) => {
        set({ error, isCalculating: false });
        if (error && typeof window !== "undefined") {
          posthog.capture("reachable_error", { error });
        }
      },

      getTravelTimeForCinema: (cinemaId) => {
        const times = get().travelTimes;
        return times[cinemaId]?.minutes ?? null;
      },

      hasValidInputs: () => {
        const state = get();
        return !!(
          state.coordinates &&
          state.finishedByTime &&
          state.finishedByTime > new Date()
        );
      },

      clear: () => {
        set(initialState);
      },

      clearResults: () => {
        set({
          travelTimes: {},
          lastCalculatedAt: null,
          error: null,
        });
      },
    }),
    {
      name: "postboxd-reachable",
      storage: createJSONStorage(() => localStorage),
      // Only persist user preferences, not transient state
      partialize: (state) => ({
        postcode: state.postcode,
        coordinates: state.coordinates,
        travelMode: state.travelMode,
        // Don't persist: finishedByTime (changes daily), travelTimes (stale quickly),
        // isCalculating, error, lastCalculatedAt
      }),
    }
  )
);

/**
 * Helper: Check if cached travel times are still fresh
 * Travel times are cached for 15 minutes
 */
export function areTravelTimesFresh(lastCalculatedAt: string | null): boolean {
  if (!lastCalculatedAt) return false;

  const calculatedTime = new Date(lastCalculatedAt);
  const now = new Date();
  const diffMinutes = (now.getTime() - calculatedTime.getTime()) / (1000 * 60);

  return diffMinutes < 15;
}

/**
 * Helper: Format travel time for display
 */
export function formatTravelTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Helper: Get travel mode label and icon
 */
export function getTravelModeInfo(mode: TravelMode): { label: string; icon: string } {
  const info: Record<TravelMode, { label: string; icon: string }> = {
    transit: { label: "Public Transport", icon: "🚇" },
    walking: { label: "Walking", icon: "🚶" },
    bicycling: { label: "Cycling", icon: "🚴" },
  };
  return info[mode];
}
