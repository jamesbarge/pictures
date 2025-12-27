/**
 * Film Status Store
 * Tracks user's relationship with films: want to see, seen, not interested
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type FilmStatus = "want_to_see" | "seen" | "not_interested" | null;

// Film metadata stored with status for display in settings
export interface FilmMetadata {
  title: string;
  year?: number | null;
  directors?: string[];
  posterUrl?: string | null;
}

interface FilmStatusEntry {
  status: FilmStatus;
  addedAt: string; // ISO date
  seenAt?: string; // ISO date when marked as seen
  rating?: number; // 1-5 stars
  notes?: string;
  // Film metadata for display (e.g., in settings "Not Interested" list)
  filmTitle?: string;
  filmYear?: number | null;
  filmDirectors?: string[];
  filmPosterUrl?: string | null;
}

// Return type for getNotInterestedFilms
export interface NotInterestedFilm {
  filmId: string;
  title: string;
  year?: number | null;
  directors?: string[];
  posterUrl?: string | null;
  addedAt: string;
}

interface FilmStatusState {
  // Map of filmId -> status entry
  films: Record<string, FilmStatusEntry>;

  // Actions
  setStatus: (filmId: string, status: FilmStatus, filmData?: FilmMetadata) => void;
  setRating: (filmId: string, rating: number) => void;
  setNotes: (filmId: string, notes: string) => void;
  removeFilm: (filmId: string) => void;
  clearAll: () => void;

  // Selectors
  getStatus: (filmId: string) => FilmStatus;
  getFilmsByStatus: (status: FilmStatus) => string[];
  getWatchlist: () => string[];
  getSeenFilms: () => string[];
  getNotInterestedFilms: () => NotInterestedFilm[];
}

export const useFilmStatus = create<FilmStatusState>()(
  persist(
    (set, get) => ({
      films: {},

      setStatus: (filmId, status, filmData) =>
        set((state) => {
          if (status === null) {
            const { [filmId]: _removed, ...rest } = state.films;
            void _removed; // Explicit unused acknowledgment
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
                // Store film metadata if provided
                ...(filmData && {
                  filmTitle: filmData.title,
                  filmYear: filmData.year,
                  filmDirectors: filmData.directors,
                  filmPosterUrl: filmData.posterUrl,
                }),
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
          const { [filmId]: _removed, ...rest } = state.films;
          void _removed; // Explicit unused acknowledgment
          return { films: rest };
        }),

      clearAll: () => set({ films: {} }),

      getStatus: (filmId) => get().films[filmId]?.status ?? null,

      getFilmsByStatus: (status) =>
        Object.entries(get().films)
          .filter(([, entry]) => entry.status === status)
          .map(([id]) => id),

      getWatchlist: () => get().getFilmsByStatus("want_to_see"),

      getSeenFilms: () => get().getFilmsByStatus("seen"),

      getNotInterestedFilms: () =>
        Object.entries(get().films)
          .filter(([, entry]) => entry.status === "not_interested")
          .map(([filmId, entry]) => ({
            filmId,
            title: entry.filmTitle || "Unknown Film",
            year: entry.filmYear,
            directors: entry.filmDirectors,
            posterUrl: entry.filmPosterUrl,
            addedAt: entry.addedAt,
          }))
          .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()),
    }),
    {
      name: "postboxd-film-status",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
