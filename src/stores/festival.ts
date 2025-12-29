/**
 * Festival Store
 * Manages festival follows, schedule, and notification preferences
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import posthog from "posthog-js";
import type {
  FestivalInterestLevel,
  FestivalScheduleStatus,
} from "@/db/schema/festivals";

// ============================================
// ANALYTICS HELPERS
// ============================================

function trackFestivalFollow(
  festivalId: string,
  festivalName: string,
  action: "followed" | "unfollowed"
) {
  if (typeof window === "undefined") return;
  posthog.capture("festival_follow_changed", {
    festival_id: festivalId,
    festival_name: festivalName,
    action,
  });
}

function trackFestivalScheduleChange(
  festivalId: string,
  screeningId: string,
  filmTitle: string,
  previousStatus: FestivalScheduleStatus | null,
  newStatus: FestivalScheduleStatus | null
) {
  if (typeof window === "undefined") return;
  posthog.capture("festival_schedule_changed", {
    festival_id: festivalId,
    screening_id: screeningId,
    film_title: filmTitle,
    previous_status: previousStatus,
    new_status: newStatus,
  });
}

function trackFestivalNotificationChange(
  festivalId: string,
  festivalName: string,
  notificationType: string,
  enabled: boolean
) {
  if (typeof window === "undefined") return;
  posthog.capture("festival_notification_changed", {
    festival_id: festivalId,
    festival_name: festivalName,
    notification_type: notificationType,
    enabled,
  });
}

// ============================================
// TYPES
// ============================================

export interface FestivalFollow {
  festivalId: string;
  festivalName: string; // Cached for display
  festivalSlug: string;
  interestLevel: FestivalInterestLevel;
  notifyOnSale: boolean;
  notifyProgramme: boolean;
  notifyReminders: boolean;
  followedAt: string; // ISO date
  updatedAt: string; // ISO timestamp for sync
}

export interface FestivalScheduleEntry {
  id: string; // UUID for this entry
  screeningId: string;
  festivalId: string;
  status: FestivalScheduleStatus;
  bookingConfirmation?: string;
  notes?: string;
  // Cached screening info for display
  filmTitle?: string;
  filmId?: string;
  datetime?: string; // ISO date
  cinemaId?: string;
  cinemaName?: string;
  // Sync tracking
  addedAt: string;
  updatedAt: string;
}

// ============================================
// STORE INTERFACE
// ============================================

interface FestivalState {
  // Followed festivals (festivalId -> follow data)
  follows: Record<string, FestivalFollow>;

  // User's festival schedule (screeningId -> schedule entry)
  schedule: Record<string, FestivalScheduleEntry>;

  // Global sync timestamp
  updatedAt: string;
}

interface FestivalActions {
  // Follow actions
  followFestival: (festival: {
    id: string;
    name: string;
    slug: string;
    interestLevel?: FestivalInterestLevel;
    notifyOnSale?: boolean;
    notifyProgramme?: boolean;
    notifyReminders?: boolean;
  }) => void;
  unfollowFestival: (festivalId: string) => void;
  updateFollowPreferences: (
    festivalId: string,
    preferences: Partial<{
      interestLevel: FestivalInterestLevel;
      notifyOnSale: boolean;
      notifyProgramme: boolean;
      notifyReminders: boolean;
    }>
  ) => void;

  // Schedule actions
  addToSchedule: (entry: {
    screeningId: string;
    festivalId: string;
    status?: FestivalScheduleStatus;
    filmTitle?: string;
    filmId?: string;
    datetime?: string;
    cinemaId?: string;
    cinemaName?: string;
    notes?: string;
  }) => void;
  updateScheduleStatus: (screeningId: string, status: FestivalScheduleStatus) => void;
  updateScheduleEntry: (
    screeningId: string,
    updates: Partial<{
      status: FestivalScheduleStatus;
      bookingConfirmation: string;
      notes: string;
    }>
  ) => void;
  removeFromSchedule: (screeningId: string) => void;
  clearFestivalSchedule: (festivalId: string) => void;

  // Sync actions
  bulkSetFollows: (follows: Record<string, FestivalFollow>) => void;
  bulkSetSchedule: (schedule: Record<string, FestivalScheduleEntry>) => void;
  getAll: () => {
    follows: Record<string, FestivalFollow>;
    schedule: Record<string, FestivalScheduleEntry>;
    updatedAt: string;
  };

  // Selectors
  isFollowing: (festivalId: string) => boolean;
  getFollow: (festivalId: string) => FestivalFollow | null;
  getFollowedFestivals: () => FestivalFollow[];
  getScheduleEntry: (screeningId: string) => FestivalScheduleEntry | null;
  getScheduleForFestival: (festivalId: string) => FestivalScheduleEntry[];
  getScheduleByStatus: (status: FestivalScheduleStatus) => FestivalScheduleEntry[];
  getWishlistCount: () => number;
  getBookedCount: () => number;

  // Reset
  reset: () => void;
}

// ============================================
// DEFAULT STATE
// ============================================

const DEFAULT_STATE: FestivalState = {
  follows: {},
  schedule: {},
  updatedAt: new Date().toISOString(),
};

// ============================================
// STORE
// ============================================

export const useFestivalStore = create<FestivalState & FestivalActions>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      // ==================
      // FOLLOW ACTIONS
      // ==================

      followFestival: (festival) =>
        set((state) => {
          const now = new Date().toISOString();
          const existing = state.follows[festival.id];

          // Track analytics
          if (!existing) {
            trackFestivalFollow(festival.id, festival.name, "followed");
          }

          return {
            follows: {
              ...state.follows,
              [festival.id]: {
                festivalId: festival.id,
                festivalName: festival.name,
                festivalSlug: festival.slug,
                interestLevel: festival.interestLevel || "following",
                notifyOnSale: festival.notifyOnSale ?? true,
                notifyProgramme: festival.notifyProgramme ?? true,
                notifyReminders: festival.notifyReminders ?? true,
                followedAt: existing?.followedAt || now,
                updatedAt: now,
              },
            },
            updatedAt: now,
          };
        }),

      unfollowFestival: (festivalId) =>
        set((state) => {
          const existing = state.follows[festivalId];
          if (existing) {
            trackFestivalFollow(festivalId, existing.festivalName, "unfollowed");
          }

          const { [festivalId]: _removed, ...rest } = state.follows;
          void _removed;
          return {
            follows: rest,
            updatedAt: new Date().toISOString(),
          };
        }),

      updateFollowPreferences: (festivalId, preferences) =>
        set((state) => {
          const existing = state.follows[festivalId];
          if (!existing) return state;

          const now = new Date().toISOString();

          // Track notification changes
          if (preferences.notifyOnSale !== undefined && preferences.notifyOnSale !== existing.notifyOnSale) {
            trackFestivalNotificationChange(festivalId, existing.festivalName, "on_sale", preferences.notifyOnSale);
          }
          if (preferences.notifyProgramme !== undefined && preferences.notifyProgramme !== existing.notifyProgramme) {
            trackFestivalNotificationChange(festivalId, existing.festivalName, "programme", preferences.notifyProgramme);
          }
          if (preferences.notifyReminders !== undefined && preferences.notifyReminders !== existing.notifyReminders) {
            trackFestivalNotificationChange(festivalId, existing.festivalName, "reminders", preferences.notifyReminders);
          }

          return {
            follows: {
              ...state.follows,
              [festivalId]: {
                ...existing,
                ...preferences,
                updatedAt: now,
              },
            },
            updatedAt: now,
          };
        }),

      // ==================
      // SCHEDULE ACTIONS
      // ==================

      addToSchedule: (entry) =>
        set((state) => {
          const now = new Date().toISOString();
          const existing = state.schedule[entry.screeningId];

          trackFestivalScheduleChange(
            entry.festivalId,
            entry.screeningId,
            entry.filmTitle || "Unknown",
            existing?.status || null,
            entry.status || "wishlist"
          );

          return {
            schedule: {
              ...state.schedule,
              [entry.screeningId]: {
                id: existing?.id || crypto.randomUUID(),
                screeningId: entry.screeningId,
                festivalId: entry.festivalId,
                status: entry.status || "wishlist",
                filmTitle: entry.filmTitle,
                filmId: entry.filmId,
                datetime: entry.datetime,
                cinemaId: entry.cinemaId,
                cinemaName: entry.cinemaName,
                notes: entry.notes,
                addedAt: existing?.addedAt || now,
                updatedAt: now,
              },
            },
            updatedAt: now,
          };
        }),

      updateScheduleStatus: (screeningId, status) =>
        set((state) => {
          const existing = state.schedule[screeningId];
          if (!existing) return state;

          trackFestivalScheduleChange(
            existing.festivalId,
            screeningId,
            existing.filmTitle || "Unknown",
            existing.status,
            status
          );

          const now = new Date().toISOString();
          return {
            schedule: {
              ...state.schedule,
              [screeningId]: {
                ...existing,
                status,
                updatedAt: now,
              },
            },
            updatedAt: now,
          };
        }),

      updateScheduleEntry: (screeningId, updates) =>
        set((state) => {
          const existing = state.schedule[screeningId];
          if (!existing) return state;

          if (updates.status && updates.status !== existing.status) {
            trackFestivalScheduleChange(
              existing.festivalId,
              screeningId,
              existing.filmTitle || "Unknown",
              existing.status,
              updates.status
            );
          }

          const now = new Date().toISOString();
          return {
            schedule: {
              ...state.schedule,
              [screeningId]: {
                ...existing,
                ...updates,
                updatedAt: now,
              },
            },
            updatedAt: now,
          };
        }),

      removeFromSchedule: (screeningId) =>
        set((state) => {
          const existing = state.schedule[screeningId];
          if (existing) {
            trackFestivalScheduleChange(
              existing.festivalId,
              screeningId,
              existing.filmTitle || "Unknown",
              existing.status,
              null
            );
          }

          const { [screeningId]: _removed, ...rest } = state.schedule;
          void _removed;
          return {
            schedule: rest,
            updatedAt: new Date().toISOString(),
          };
        }),

      clearFestivalSchedule: (festivalId) =>
        set((state) => {
          const newSchedule: Record<string, FestivalScheduleEntry> = {};
          for (const [screeningId, entry] of Object.entries(state.schedule)) {
            if (entry.festivalId !== festivalId) {
              newSchedule[screeningId] = entry;
            }
          }
          return {
            schedule: newSchedule,
            updatedAt: new Date().toISOString(),
          };
        }),

      // ==================
      // SYNC ACTIONS
      // ==================

      bulkSetFollows: (follows) =>
        set({
          follows,
          updatedAt: new Date().toISOString(),
        }),

      bulkSetSchedule: (schedule) =>
        set({
          schedule,
          updatedAt: new Date().toISOString(),
        }),

      getAll: () => {
        const state = get();
        return {
          follows: state.follows,
          schedule: state.schedule,
          updatedAt: state.updatedAt,
        };
      },

      // ==================
      // SELECTORS
      // ==================

      isFollowing: (festivalId) => !!get().follows[festivalId],

      getFollow: (festivalId) => get().follows[festivalId] || null,

      getFollowedFestivals: () =>
        Object.values(get().follows).sort(
          (a, b) => new Date(b.followedAt).getTime() - new Date(a.followedAt).getTime()
        ),

      getScheduleEntry: (screeningId) => get().schedule[screeningId] || null,

      getScheduleForFestival: (festivalId) =>
        Object.values(get().schedule)
          .filter((entry) => entry.festivalId === festivalId)
          .sort((a, b) => {
            if (!a.datetime || !b.datetime) return 0;
            return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
          }),

      getScheduleByStatus: (status) =>
        Object.values(get().schedule)
          .filter((entry) => entry.status === status)
          .sort((a, b) => {
            if (!a.datetime || !b.datetime) return 0;
            return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
          }),

      getWishlistCount: () =>
        Object.values(get().schedule).filter((e) => e.status === "wishlist").length,

      getBookedCount: () =>
        Object.values(get().schedule).filter((e) => e.status === "booked").length,

      // ==================
      // RESET
      // ==================

      reset: () => set({ ...DEFAULT_STATE, updatedAt: new Date().toISOString() }),
    }),
    {
      name: "postboxd-festivals",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// ============================================
// DERIVED HOOKS
// ============================================

/**
 * Hook to get all festivals the user is following with notification enabled
 * for a specific notification type
 */
export function useFestivalsWithNotification(
  notificationType: "onSale" | "programme" | "reminders"
): FestivalFollow[] {
  const follows = useFestivalStore((state) => state.follows);

  return Object.values(follows).filter((follow) => {
    switch (notificationType) {
      case "onSale":
        return follow.notifyOnSale;
      case "programme":
        return follow.notifyProgramme;
      case "reminders":
        return follow.notifyReminders;
      default:
        return false;
    }
  });
}

/**
 * Hook to check if any screenings in the schedule have conflicts
 * (overlapping times)
 */
export function useScheduleConflicts(festivalId?: string): Array<{
  screening1: FestivalScheduleEntry;
  screening2: FestivalScheduleEntry;
}> {
  const schedule = useFestivalStore((state) => state.schedule);

  const entries = Object.values(schedule)
    .filter((e) => !festivalId || e.festivalId === festivalId)
    .filter((e) => e.datetime && (e.status === "wishlist" || e.status === "booked"))
    .sort((a, b) => new Date(a.datetime!).getTime() - new Date(b.datetime!).getTime());

  const conflicts: Array<{ screening1: FestivalScheduleEntry; screening2: FestivalScheduleEntry }> = [];

  // Simple conflict detection: screenings within 2 hours of each other
  const SCREENING_BUFFER_MS = 2 * 60 * 60 * 1000; // 2 hours

  for (let i = 0; i < entries.length - 1; i++) {
    const current = entries[i];
    const next = entries[i + 1];

    if (!current.datetime || !next.datetime) continue;

    const currentTime = new Date(current.datetime).getTime();
    const nextTime = new Date(next.datetime).getTime();

    if (nextTime - currentTime < SCREENING_BUFFER_MS) {
      conflicts.push({ screening1: current, screening2: next });
    }
  }

  return conflicts;
}
