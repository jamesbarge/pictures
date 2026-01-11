/**
 * Filters Store
 * Manages screening filter state with URL sync
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import posthog from "posthog-js";

// Re-export types and constants for backwards compatibility
export {
  type TimeOfDay,
  type ProgrammingType,
  DECADES,
  COMMON_GENRES,
  FORMAT_OPTIONS,
  TIME_PRESETS,
  getTimeOfDayLabel,
  getTimeOfDayFromHour,
  getProgrammingTypeLabel,
  isIndependentCinema,
  formatHour,
  formatTimeRange,
  matchesTimePreset,
} from "@/lib/filter-constants";

import type { TimeOfDay, ProgrammingType } from "@/lib/filter-constants";

// Helper to track filter changes
function trackFilterChange(filterType: string, value: unknown, action: "added" | "removed" | "set" | "cleared") {
  if (typeof window !== "undefined") {
    posthog.capture("filter_changed", {
      filter_type: filterType,
      value,
      action,
    });
  }
}

export interface FilterState {
  // Search
  filmSearch: string; // Dynamic film title search
  cinemaIds: string[]; // Selected cinema IDs

  // Date range
  dateFrom: Date | null;
  dateTo: Date | null;

  // Time range (hours 0-23)
  timeFrom: number | null; // Start hour (inclusive)
  timeTo: number | null; // End hour (inclusive)

  // Format filters
  formats: string[]; // "35mm", "70mm", "imax", etc.

  // Programming type
  programmingTypes: ProgrammingType[];

  // Film metadata
  decades: string[]; // "1950s", "1960s", etc.
  genres: string[];

  // Time of day (legacy, kept for compatibility)
  timesOfDay: TimeOfDay[];

  // Festival filtering
  festivalSlug: string | null; // Filter by specific festival
  festivalOnly: boolean; // Only show festival screenings

  // Season filtering
  seasonSlug: string | null; // Filter by specific director season

  // Personal
  hideSeen: boolean;
  hideNotInterested: boolean;
  onlySingleShowings: boolean;

  // Sync tracking (for persisted fields only)
  updatedAt: string; // ISO timestamp for conflict resolution
}

// Type for persisted filter fields (synced to server)
export interface PersistedFilters {
  cinemaIds: string[];
  formats: string[];
  programmingTypes: ProgrammingType[];
  decades: string[];
  genres: string[];
  timesOfDay: TimeOfDay[];
  festivalSlug: string | null;
  festivalOnly: boolean;
  seasonSlug: string | null;
  hideSeen: boolean;
  hideNotInterested: boolean;
  onlySingleShowings: boolean;
  updatedAt: string;
}

interface FilterActions {
  setFilmSearch: (search: string) => void;
  toggleCinema: (cinemaId: string) => void;
  setCinemas: (cinemaIds: string[]) => void;
  setDateRange: (from: Date | null, to: Date | null) => void;
  setTimeRange: (from: number | null, to: number | null) => void;
  toggleFormat: (format: string) => void;
  toggleProgrammingType: (type: ProgrammingType) => void;
  setProgrammingTypes: (types: ProgrammingType[]) => void;
  toggleDecade: (decade: string) => void;
  setDecades: (decades: string[]) => void;
  toggleGenre: (genre: string) => void;
  setGenres: (genres: string[]) => void;
  toggleTimeOfDay: (time: TimeOfDay) => void;
  // Festival filters
  setFestivalFilter: (slug: string | null) => void;
  setFestivalOnly: (festivalOnly: boolean) => void;
  clearFestivalFilter: () => void;
  // Season filters
  setSeasonFilter: (slug: string | null) => void;
  clearSeasonFilter: () => void;
  // Personal
  setHideSeen: (hide: boolean) => void;
  setHideNotInterested: (hide: boolean) => void;
  setOnlySingleShowings: (enabled: boolean) => void;
  clearAllFilters: () => void;
  getActiveFilterCount: () => number;

  // Sync actions
  bulkSetPersisted: (filters: Partial<PersistedFilters>) => void;
  getPersistedFilters: () => PersistedFilters;
}

const initialState: FilterState = {
  filmSearch: "",
  cinemaIds: [],
  dateFrom: null,
  dateTo: null,
  timeFrom: null,
  timeTo: null,
  formats: [],
  programmingTypes: [],
  decades: [],
  genres: [],
  timesOfDay: [],
  festivalSlug: null,
  festivalOnly: false,
  seasonSlug: null,
  hideSeen: false,
  hideNotInterested: true, // Films marked "not interested" are hidden by default
  onlySingleShowings: false,
  updatedAt: new Date().toISOString(),
};

export const useFilters = create<FilterState & FilterActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setFilmSearch: (search) => {
        set({ filmSearch: search });
        if (search.trim()) {
          trackFilterChange("film_search", search, "set");
        }
      },

      toggleCinema: (cinemaId) => set((state) => {
        const isRemoving = state.cinemaIds.includes(cinemaId);
        trackFilterChange("cinema", cinemaId, isRemoving ? "removed" : "added");
        return {
          cinemaIds: isRemoving
            ? state.cinemaIds.filter((id) => id !== cinemaId)
            : [...state.cinemaIds, cinemaId],
          updatedAt: new Date().toISOString(),
        };
      }),

      setCinemas: (cinemaIds) => {
        trackFilterChange("cinemas", cinemaIds, "set");
        set({ cinemaIds, updatedAt: new Date().toISOString() });
      },

      setDateRange: (from, to) => {
        trackFilterChange("date_range", { from, to }, "set");
        set({ dateFrom: from, dateTo: to });
      },

      setTimeRange: (from, to) => {
        trackFilterChange("time_range", { from, to }, "set");
        set({ timeFrom: from, timeTo: to });
      },

      toggleFormat: (format) => set((state) => {
        const isRemoving = state.formats.includes(format);
        trackFilterChange("format", format, isRemoving ? "removed" : "added");
        return {
          formats: isRemoving
            ? state.formats.filter((f) => f !== format)
            : [...state.formats, format],
          updatedAt: new Date().toISOString(),
        };
      }),

      toggleProgrammingType: (type) => set((state) => {
        const isRemoving = state.programmingTypes.includes(type);
        trackFilterChange("programming_type", type, isRemoving ? "removed" : "added");
        return {
          programmingTypes: isRemoving
            ? state.programmingTypes.filter((t) => t !== type)
            : [...state.programmingTypes, type],
          updatedAt: new Date().toISOString(),
        };
      }),

      setProgrammingTypes: (types) => {
        trackFilterChange("programming_types", types, "set");
        set({ programmingTypes: types, updatedAt: new Date().toISOString() });
      },

      toggleDecade: (decade) => set((state) => {
        const isRemoving = state.decades.includes(decade);
        trackFilterChange("decade", decade, isRemoving ? "removed" : "added");
        return {
          decades: isRemoving
            ? state.decades.filter((d) => d !== decade)
            : [...state.decades, decade],
          updatedAt: new Date().toISOString(),
        };
      }),

      setDecades: (decades) => {
        trackFilterChange("decades", decades, "set");
        set({ decades, updatedAt: new Date().toISOString() });
      },

      toggleGenre: (genre) => set((state) => {
        const isRemoving = state.genres.includes(genre);
        trackFilterChange("genre", genre, isRemoving ? "removed" : "added");
        return {
          genres: isRemoving
            ? state.genres.filter((g) => g !== genre)
            : [...state.genres, genre],
          updatedAt: new Date().toISOString(),
        };
      }),

      setGenres: (genres) => {
        trackFilterChange("genres", genres, "set");
        set({ genres, updatedAt: new Date().toISOString() });
      },

      toggleTimeOfDay: (time) => set((state) => {
        const isRemoving = state.timesOfDay.includes(time);
        trackFilterChange("time_of_day", time, isRemoving ? "removed" : "added");
        return {
          timesOfDay: isRemoving
            ? state.timesOfDay.filter((t) => t !== time)
            : [...state.timesOfDay, time],
          updatedAt: new Date().toISOString(),
        };
      }),

      // Festival filter actions
      setFestivalFilter: (slug) => {
        trackFilterChange("festival", slug, slug ? "set" : "cleared");
        set({ festivalSlug: slug, updatedAt: new Date().toISOString() });
      },

      setFestivalOnly: (festivalOnly) => {
        trackFilterChange("festival_only", festivalOnly, "set");
        set({ festivalOnly, updatedAt: new Date().toISOString() });
      },

      clearFestivalFilter: () => {
        trackFilterChange("festival", null, "cleared");
        set({ festivalSlug: null, festivalOnly: false, updatedAt: new Date().toISOString() });
      },

      // Season filter actions
      setSeasonFilter: (slug) => {
        trackFilterChange("season", slug, slug ? "set" : "cleared");
        set({ seasonSlug: slug, updatedAt: new Date().toISOString() });
      },

      clearSeasonFilter: () => {
        trackFilterChange("season", null, "cleared");
        set({ seasonSlug: null, updatedAt: new Date().toISOString() });
      },

      setHideSeen: (hide) => {
        trackFilterChange("hide_seen", hide, "set");
        set({ hideSeen: hide, updatedAt: new Date().toISOString() });
      },

      setHideNotInterested: (hide) => {
        trackFilterChange("hide_not_interested", hide, "set");
        set({ hideNotInterested: hide, updatedAt: new Date().toISOString() });
      },

      setOnlySingleShowings: (enabled) => {
        trackFilterChange("single_showings", enabled, "set");
        set({ onlySingleShowings: enabled, updatedAt: new Date().toISOString() });
      },

      clearAllFilters: () => {
        trackFilterChange("all", null, "cleared");
        set({ ...initialState, updatedAt: new Date().toISOString() });
      },

      getActiveFilterCount: () => {
        const state = get();
        let count = 0;
        if (state.filmSearch.trim()) count++;
        // Count cinema selection as 1 filter (not N for N cinemas)
        if (state.cinemaIds.length > 0) count++;
        if (state.dateFrom || state.dateTo) count++;
        if (state.timeFrom !== null || state.timeTo !== null) count++;
        count += state.formats.length;
        count += state.programmingTypes.length;
        count += state.decades.length;
        count += state.genres.length;
        count += state.timesOfDay.length;
        // Festival filters
        if (state.festivalSlug) count++;
        if (state.festivalOnly) count++;
        // Season filters
        if (state.seasonSlug) count++;
        if (state.hideSeen) count++;
        if (state.onlySingleShowings) count++;
        // Don't count hideNotInterested - it's the default behavior
        // Users expect "not interested" films to be hidden automatically
        return count;
      },

      // Sync actions - update persisted fields from server merge
      bulkSetPersisted: (filters) => set({
        ...filters,
        updatedAt: filters.updatedAt || new Date().toISOString(),
      }),

      getPersistedFilters: () => {
        const state = get();
        return {
          cinemaIds: state.cinemaIds,
          formats: state.formats,
          programmingTypes: state.programmingTypes,
          decades: state.decades,
          genres: state.genres,
          timesOfDay: state.timesOfDay,
          festivalSlug: state.festivalSlug,
          festivalOnly: state.festivalOnly,
          seasonSlug: state.seasonSlug,
          hideSeen: state.hideSeen,
          hideNotInterested: state.hideNotInterested,
          onlySingleShowings: state.onlySingleShowings,
          updatedAt: state.updatedAt,
        };
      },
    }),
    {
      name: "pictures-filters",
      // Don't persist search terms or date range - they should reset each session
      partialize: (state) => ({
        cinemaIds: state.cinemaIds,
        formats: state.formats,
        programmingTypes: state.programmingTypes,
        decades: state.decades,
        genres: state.genres,
        timesOfDay: state.timesOfDay,
        festivalSlug: state.festivalSlug,
        festivalOnly: state.festivalOnly,
        seasonSlug: state.seasonSlug,
        hideSeen: state.hideSeen,
        hideNotInterested: state.hideNotInterested,
        onlySingleShowings: state.onlySingleShowings,
        updatedAt: state.updatedAt,
      }),
    }
  )
);
