/**
 * Filters Store
 * Manages screening filter state with URL sync
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import posthog from "posthog-js";

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

export type TimeOfDay = "morning" | "afternoon" | "evening" | "late_night";
export type ProgrammingType = "repertory" | "new_release" | "special_event" | "preview";
export type VenueType = "all" | "independent" | "chain";

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

  // Venue type (chain vs independent)
  venueType: VenueType;

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
  venueType: VenueType;
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
  // Venue type
  setVenueType: (type: VenueType) => void;
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
  venueType: "all",
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

      // Venue type actions
      setVenueType: (type) => {
        trackFilterChange("venue_type", type, "set");
        set({ venueType: type, updatedAt: new Date().toISOString() });
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
        // Venue type (only count if not "all")
        if (state.venueType !== "all") count++;
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
          venueType: state.venueType,
          hideSeen: state.hideSeen,
          hideNotInterested: state.hideNotInterested,
          onlySingleShowings: state.onlySingleShowings,
          updatedAt: state.updatedAt,
        };
      },
    }),
    {
      name: "postboxd-filters",
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
        venueType: state.venueType,
        hideSeen: state.hideSeen,
        hideNotInterested: state.hideNotInterested,
        onlySingleShowings: state.onlySingleShowings,
        updatedAt: state.updatedAt,
      }),
    }
  )
);

// Helper functions
export function getTimeOfDayLabel(time: TimeOfDay): string {
  const labels: Record<TimeOfDay, string> = {
    morning: "Morning (before 12pm)",
    afternoon: "Afternoon (12pm-5pm)",
    evening: "Evening (5pm-9pm)",
    late_night: "Late Night (after 9pm)",
  };
  return labels[time];
}

export function getTimeOfDayFromHour(hour: number): TimeOfDay {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "late_night";
}

export function getProgrammingTypeLabel(type: ProgrammingType): string {
  const labels: Record<ProgrammingType, string> = {
    repertory: "Repertory / Classic",
    new_release: "New Release",
    special_event: "Special Event",
    preview: "Preview / Premiere",
  };
  return labels[type];
}

export function getVenueTypeLabel(type: VenueType): string {
  const labels: Record<VenueType, string> = {
    all: "All Venues",
    independent: "Independent",
    chain: "Chains",
  };
  return labels[type];
}

/** Check if a cinema is independent (BFI is treated as independent despite having a chain value) */
export function isIndependentCinema(chain: string | null): boolean {
  return chain === null || chain === "BFI";
}

export const DECADES = [
  "Pre-1950",
  "1950s",
  "1960s",
  "1970s",
  "1980s",
  "1990s",
  "2000s",
  "2010s",
  "2020s",
] as const;

export const COMMON_GENRES = [
  "Drama",
  "Comedy",
  "Horror",
  "Documentary",
  "Sci-Fi",
  "Action",
  "Thriller",
  "Romance",
  "Animation",
] as const;

export const FORMAT_OPTIONS = [
  { value: "35mm", label: "35mm" },
  { value: "70mm", label: "70mm" },
  { value: "70mm_imax", label: "70mm IMAX" },
  { value: "imax", label: "IMAX" },
  { value: "imax_laser", label: "IMAX Laser" },
  { value: "dcp_4k", label: "4K" },
  { value: "dolby_cinema", label: "Dolby Cinema" },
] as const;

// Time presets for common screening windows
export const TIME_PRESETS = [
  { label: "Morning", shortLabel: "AM", from: 0, to: 11, description: "Before 12pm" },
  { label: "Afternoon", shortLabel: "Aft", from: 12, to: 16, description: "12pm - 5pm" },
  { label: "Evening", shortLabel: "Eve", from: 17, to: 20, description: "5pm - 9pm" },
  { label: "Late", shortLabel: "Late", from: 21, to: 23, description: "After 9pm" },
] as const;

// Format hour to 12h display (e.g., 14 -> "2pm", 9 -> "9am")
export function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

// Format time range for display
export function formatTimeRange(from: number | null, to: number | null): string {
  if (from === null && to === null) return "Any Time";
  if (from !== null && to === null) return `After ${formatHour(from)}`;
  if (from === null && to !== null) return `Before ${formatHour(to + 1)}`;
  if (from === to) return formatHour(from!);
  return `${formatHour(from!)} - ${formatHour(to! + 1)}`;
}

// Check if a time range matches a preset
export function matchesTimePreset(
  from: number | null,
  to: number | null,
  preset: typeof TIME_PRESETS[number]
): boolean {
  return from === preset.from && to === preset.to;
}
