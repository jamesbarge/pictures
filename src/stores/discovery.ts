/**
 * Discovery State Store
 * Tracks user discovery of key features to manage banner visibility
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface DiscoveryState {
  // Feature visit tracking
  hasVisitedReachable: boolean;
  hasVisitedMap: boolean;

  // Banner dismissal
  bannerDismissedAt: string | null; // ISO timestamp

  // Actions
  markFeatureVisited: (feature: "reachable" | "map") => void;
  dismissBanner: () => void;

  // Computed
  shouldShowBanner: () => boolean;

  // Reset (for testing)
  resetDiscovery: () => void;
}

const DEFAULT_STATE = {
  hasVisitedReachable: false,
  hasVisitedMap: false,
  bannerDismissedAt: null as string | null,
};

export const useDiscovery = create<DiscoveryState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      markFeatureVisited: (feature) => {
        set((state) => ({
          hasVisitedReachable: feature === "reachable" ? true : state.hasVisitedReachable,
          hasVisitedMap: feature === "map" ? true : state.hasVisitedMap,
        }));
      },

      dismissBanner: () => {
        set({ bannerDismissedAt: new Date().toISOString() });
      },

      shouldShowBanner: () => {
        const state = get();

        // If user has visited both features, hide banner permanently
        if (state.hasVisitedReachable && state.hasVisitedMap) {
          return false;
        }

        // If manually dismissed but hasn't visited both features,
        // still hide (user explicitly doesn't want to see it)
        if (state.bannerDismissedAt) {
          return false;
        }

        // Show banner - user hasn't seen both features yet
        return true;
      },

      resetDiscovery: () => {
        set(DEFAULT_STATE);
      },
    }),
    {
      name: "pictures-discovery",
      storage: createJSONStorage(() => localStorage),
      // Don't persist the methods
      partialize: (state) => ({
        hasVisitedReachable: state.hasVisitedReachable,
        hasVisitedMap: state.hasVisitedMap,
        bannerDismissedAt: state.bannerDismissedAt,
      }),
    }
  )
);
