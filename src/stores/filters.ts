/**
 * Filters Store
 * Manages screening filter state with URL sync
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TimeOfDay = "morning" | "afternoon" | "evening" | "late_night";
export type ProgrammingType = "repertory" | "new_release" | "special_event" | "preview";

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

  // Personal
  hideSeen: boolean;
  hideNotInterested: boolean;
}

interface FilterActions {
  setFilmSearch: (search: string) => void;
  toggleCinema: (cinemaId: string) => void;
  setCinemas: (cinemaIds: string[]) => void;
  setDateRange: (from: Date | null, to: Date | null) => void;
  setTimeRange: (from: number | null, to: number | null) => void;
  toggleFormat: (format: string) => void;
  toggleProgrammingType: (type: ProgrammingType) => void;
  toggleDecade: (decade: string) => void;
  setDecades: (decades: string[]) => void;
  toggleGenre: (genre: string) => void;
  setGenres: (genres: string[]) => void;
  toggleTimeOfDay: (time: TimeOfDay) => void;
  setHideSeen: (hide: boolean) => void;
  setHideNotInterested: (hide: boolean) => void;
  clearAllFilters: () => void;
  getActiveFilterCount: () => number;
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
  hideSeen: false,
  hideNotInterested: false,
};

export const useFilters = create<FilterState & FilterActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setFilmSearch: (search) => set({ filmSearch: search }),

      toggleCinema: (cinemaId) => set((state) => ({
        cinemaIds: state.cinemaIds.includes(cinemaId)
          ? state.cinemaIds.filter((id) => id !== cinemaId)
          : [...state.cinemaIds, cinemaId],
      })),

      setCinemas: (cinemaIds) => set({ cinemaIds }),

      setDateRange: (from, to) => set({ dateFrom: from, dateTo: to }),

      setTimeRange: (from, to) => set({ timeFrom: from, timeTo: to }),

      toggleFormat: (format) => set((state) => ({
        formats: state.formats.includes(format)
          ? state.formats.filter((f) => f !== format)
          : [...state.formats, format],
      })),

      toggleProgrammingType: (type) => set((state) => ({
        programmingTypes: state.programmingTypes.includes(type)
          ? state.programmingTypes.filter((t) => t !== type)
          : [...state.programmingTypes, type],
      })),

      toggleDecade: (decade) => set((state) => ({
        decades: state.decades.includes(decade)
          ? state.decades.filter((d) => d !== decade)
          : [...state.decades, decade],
      })),

      setDecades: (decades) => set({ decades }),

      toggleGenre: (genre) => set((state) => ({
        genres: state.genres.includes(genre)
          ? state.genres.filter((g) => g !== genre)
          : [...state.genres, genre],
      })),

      setGenres: (genres) => set({ genres }),

      toggleTimeOfDay: (time) => set((state) => ({
        timesOfDay: state.timesOfDay.includes(time)
          ? state.timesOfDay.filter((t) => t !== time)
          : [...state.timesOfDay, time],
      })),

      setHideSeen: (hide) => set({ hideSeen: hide }),
      setHideNotInterested: (hide) => set({ hideNotInterested: hide }),

      clearAllFilters: () => set(initialState),

      getActiveFilterCount: () => {
        const state = get();
        let count = 0;
        if (state.filmSearch.trim()) count++;
        count += state.cinemaIds.length;
        if (state.dateFrom || state.dateTo) count++;
        if (state.timeFrom !== null || state.timeTo !== null) count++;
        count += state.formats.length;
        count += state.programmingTypes.length;
        count += state.decades.length;
        count += state.genres.length;
        count += state.timesOfDay.length;
        if (state.hideSeen) count++;
        if (state.hideNotInterested) count++;
        return count;
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
        hideSeen: state.hideSeen,
        hideNotInterested: state.hideNotInterested,
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
