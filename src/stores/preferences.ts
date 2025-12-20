/**
 * User Preferences Store
 * Persists cinema selections and view settings to localStorage
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface PreferencesState {
  // Selected cinemas (IDs of cinemas the user wants to see)
  selectedCinemas: string[];

  // View preferences
  defaultView: "list" | "grid";
  showRepertoryOnly: boolean;
  hidePastScreenings: boolean;

  // Filter defaults
  defaultDateRange: "today" | "tomorrow" | "week" | "weekend" | "all";
  preferredFormats: string[];

  // Actions
  toggleCinema: (cinemaId: string) => void;
  setCinemas: (cinemaIds: string[]) => void;
  selectAllCinemas: (cinemaIds: string[]) => void;
  clearCinemas: () => void;
  setDefaultView: (view: "list" | "grid") => void;
  setShowRepertoryOnly: (show: boolean) => void;
  setHidePastScreenings: (hide: boolean) => void;
  setDefaultDateRange: (range: PreferencesState["defaultDateRange"]) => void;
  togglePreferredFormat: (format: string) => void;
  reset: () => void;
}

const DEFAULT_STATE = {
  selectedCinemas: [] as string[],
  defaultView: "list" as const,
  showRepertoryOnly: false,
  hidePastScreenings: true,
  defaultDateRange: "all" as const,
  preferredFormats: [] as string[],
};

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      toggleCinema: (cinemaId) =>
        set((state) => ({
          selectedCinemas: state.selectedCinemas.includes(cinemaId)
            ? state.selectedCinemas.filter((id) => id !== cinemaId)
            : [...state.selectedCinemas, cinemaId],
        })),

      setCinemas: (cinemaIds) =>
        set({ selectedCinemas: cinemaIds }),

      selectAllCinemas: (cinemaIds) =>
        set({ selectedCinemas: cinemaIds }),

      clearCinemas: () =>
        set({ selectedCinemas: [] }),

      setDefaultView: (view) =>
        set({ defaultView: view }),

      setShowRepertoryOnly: (show) =>
        set({ showRepertoryOnly: show }),

      setHidePastScreenings: (hide) =>
        set({ hidePastScreenings: hide }),

      setDefaultDateRange: (range) =>
        set({ defaultDateRange: range }),

      togglePreferredFormat: (format) =>
        set((state) => ({
          preferredFormats: state.preferredFormats.includes(format)
            ? state.preferredFormats.filter((f) => f !== format)
            : [...state.preferredFormats, format],
        })),

      reset: () => set(DEFAULT_STATE),
    }),
    {
      name: "postboxd-preferences",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
