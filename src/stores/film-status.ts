/**
 * Film Status Store
 * Tracks user's relationship with films: want to see, seen, not interested
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type FilmStatus = "want_to_see" | "seen" | "not_interested" | null;

interface FilmStatusEntry {
  status: FilmStatus;
  addedAt: string; // ISO date
  seenAt?: string; // ISO date when marked as seen
  rating?: number; // 1-5 stars
  notes?: string;
}

interface FilmStatusState {
  // Map of filmId -> status entry
  films: Record<string, FilmStatusEntry>;

  // Actions
  setStatus: (filmId: string, status: FilmStatus) => void;
  setRating: (filmId: string, rating: number) => void;
  setNotes: (filmId: string, notes: string) => void;
  removeFilm: (filmId: string) => void;
  clearAll: () => void;

  // Selectors
  getStatus: (filmId: string) => FilmStatus;
  getFilmsByStatus: (status: FilmStatus) => string[];
  getWatchlist: () => string[];
  getSeenFilms: () => string[];
}

export const useFilmStatus = create<FilmStatusState>()(
  persist(
    (set, get) => ({
      films: {},

      setStatus: (filmId, status) =>
        set((state) => {
          if (status === null) {
            const { [filmId]: _, ...rest } = state.films;
            return { films: rest };
          }

          const existing = state.films[filmId];
          return {
            films: {
              ...state.films,
              [filmId]: {
                ...existing,
                status,
                addedAt: existing?.addedAt || new Date().toISOString(),
                seenAt: status === "seen" ? new Date().toISOString() : existing?.seenAt,
              },
            },
          };
        }),

      setRating: (filmId, rating) =>
        set((state) => {
          const existing = state.films[filmId];
          if (!existing) return state;

          return {
            films: {
              ...state.films,
              [filmId]: { ...existing, rating },
            },
          };
        }),

      setNotes: (filmId, notes) =>
        set((state) => {
          const existing = state.films[filmId];
          if (!existing) return state;

          return {
            films: {
              ...state.films,
              [filmId]: { ...existing, notes },
            },
          };
        }),

      removeFilm: (filmId) =>
        set((state) => {
          const { [filmId]: _, ...rest } = state.films;
          return { films: rest };
        }),

      clearAll: () => set({ films: {} }),

      getStatus: (filmId) => get().films[filmId]?.status ?? null,

      getFilmsByStatus: (status) =>
        Object.entries(get().films)
          .filter(([_, entry]) => entry.status === status)
          .map(([id]) => id),

      getWatchlist: () => get().getFilmsByStatus("want_to_see"),

      getSeenFilms: () => get().getFilmsByStatus("seen"),
    }),
    {
      name: "postboxd-film-status",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
