/**
 * User Preferences Store
 * Persists cinema selections and view settings to localStorage
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { MapArea } from "@/lib/geo-utils";

export interface PreferencesState {
  // Selected cinemas (IDs of cinemas the user wants to see)
  selectedCinemas: string[];

  // View preferences
  defaultView: "list" | "grid";
  calendarViewMode: "films" | "screenings";
  showRepertoryOnly: boolean;
  hidePastScreenings: boolean;

  // Filter defaults
  defaultDateRange: "today" | "tomorrow" | "week" | "weekend" | "all";
  preferredFormats: string[];

  // Map-based filtering
  mapArea: MapArea | null;
  useMapFiltering: boolean;

  // Sync tracking
  updatedAt: string; // ISO timestamp for conflict resolution

  // Actions
  toggleCinema: (cinemaId: string) => void;
  setCinemas: (cinemaIds: string[]) => void;
  selectAllCinemas: (cinemaIds: string[]) => void;
  clearCinemas: () => void;
  setDefaultView: (view: "list" | "grid") => void;
  setCalendarViewMode: (mode: "films" | "screenings") => void;
  setShowRepertoryOnly: (show: boolean) => void;
  setHidePastScreenings: (hide: boolean) => void;
  setDefaultDateRange: (range: PreferencesState["defaultDateRange"]) => void;
  togglePreferredFormat: (format: string) => void;
  reset: () => void;

  // Map actions
  setMapArea: (area: MapArea | null) => void;
  toggleMapFiltering: () => void;
  clearMapArea: () => void;

  // Sync actions
  bulkSet: (prefs: Partial<PreferencesState>) => void;
  getAll: () => Omit<PreferencesState, "toggleCinema" | "setCinemas" | "selectAllCinemas" | "clearCinemas" | "setDefaultView" | "setCalendarViewMode" | "setShowRepertoryOnly" | "setHidePastScreenings" | "setDefaultDateRange" | "togglePreferredFormat" | "reset" | "setMapArea" | "toggleMapFiltering" | "clearMapArea" | "bulkSet" | "getAll">;
}

const DEFAULT_STATE = {
  selectedCinemas: [] as string[],
  defaultView: "list" as const,
  calendarViewMode: "films" as const,
  showRepertoryOnly: false,
  hidePastScreenings: true,
  defaultDateRange: "all" as const,
  preferredFormats: [] as string[],
  mapArea: null as MapArea | null,
  useMapFiltering: false,
  updatedAt: new Date().toISOString(),
};

export const usePreferences = create<PreferencesState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      toggleCinema: (cinemaId) =>
        set((state) => ({
          selectedCinemas: state.selectedCinemas.includes(cinemaId)
            ? state.selectedCinemas.filter((id) => id !== cinemaId)
            : [...state.selectedCinemas, cinemaId],
          updatedAt: new Date().toISOString(),
        })),

      setCinemas: (cinemaIds) =>
        set({ selectedCinemas: cinemaIds, updatedAt: new Date().toISOString() }),

      selectAllCinemas: (cinemaIds) =>
        set({ selectedCinemas: cinemaIds, updatedAt: new Date().toISOString() }),

      clearCinemas: () =>
        set({ selectedCinemas: [], updatedAt: new Date().toISOString() }),

      setDefaultView: (view) =>
        set({ defaultView: view, updatedAt: new Date().toISOString() }),

      setCalendarViewMode: (mode) =>
        set({ calendarViewMode: mode, updatedAt: new Date().toISOString() }),

      setShowRepertoryOnly: (show) =>
        set({ showRepertoryOnly: show, updatedAt: new Date().toISOString() }),

      setHidePastScreenings: (hide) =>
        set({ hidePastScreenings: hide, updatedAt: new Date().toISOString() }),

      setDefaultDateRange: (range) =>
        set({ defaultDateRange: range, updatedAt: new Date().toISOString() }),

      togglePreferredFormat: (format) =>
        set((state) => ({
          preferredFormats: state.preferredFormats.includes(format)
            ? state.preferredFormats.filter((f) => f !== format)
            : [...state.preferredFormats, format],
          updatedAt: new Date().toISOString(),
        })),

      reset: () => set({ ...DEFAULT_STATE, updatedAt: new Date().toISOString() }),

      // Map actions
      setMapArea: (area) =>
        set({
          mapArea: area,
          useMapFiltering: area !== null,
          updatedAt: new Date().toISOString(),
        }),

      toggleMapFiltering: () =>
        set((state) => ({
          useMapFiltering: state.mapArea ? !state.useMapFiltering : false,
          updatedAt: new Date().toISOString(),
        })),

      clearMapArea: () =>
        set({
          mapArea: null,
          useMapFiltering: false,
          updatedAt: new Date().toISOString(),
        }),

      // Sync actions
      bulkSet: (prefs) => set({ ...prefs, updatedAt: prefs.updatedAt || new Date().toISOString() }),

      getAll: () => {
        const state = get();
        return {
          selectedCinemas: state.selectedCinemas,
          defaultView: state.defaultView,
          calendarViewMode: state.calendarViewMode,
          showRepertoryOnly: state.showRepertoryOnly,
          hidePastScreenings: state.hidePastScreenings,
          defaultDateRange: state.defaultDateRange,
          preferredFormats: state.preferredFormats,
          mapArea: state.mapArea,
          useMapFiltering: state.useMapFiltering,
          updatedAt: state.updatedAt,
        };
      },
    }),
    {
      name: "pictures-preferences",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
