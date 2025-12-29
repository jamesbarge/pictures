/**
 * Festival Sync Service
 * Handles bidirectional sync of festival follows and schedule between localStorage and server
 * Strategy: localStorage is fast cache, server is source of truth
 * Conflict resolution: timestamp-based, newest wins
 */

import {
  useFestivalStore,
  type FestivalFollow,
  type FestivalScheduleEntry,
} from "@/stores/festival";

interface FestivalSyncResponse {
  success: boolean;
  follows: Record<string, FestivalFollow>;
  schedule: Record<string, FestivalScheduleEntry>;
  updatedAt: string;
}

/**
 * Transform local follows to API format
 */
function followsToApiFormat(): Array<{
  festivalId: string;
  festivalName: string;
  festivalSlug: string;
  interestLevel: string;
  notifyOnSale: boolean;
  notifyProgramme: boolean;
  notifyReminders: boolean;
  followedAt: string;
  updatedAt: string;
}> {
  const follows = useFestivalStore.getState().follows;
  return Object.values(follows).map((follow) => ({
    festivalId: follow.festivalId,
    festivalName: follow.festivalName,
    festivalSlug: follow.festivalSlug,
    interestLevel: follow.interestLevel,
    notifyOnSale: follow.notifyOnSale,
    notifyProgramme: follow.notifyProgramme,
    notifyReminders: follow.notifyReminders,
    followedAt: follow.followedAt,
    updatedAt: follow.updatedAt,
  }));
}

/**
 * Transform local schedule to API format
 */
function scheduleToApiFormat(): Array<{
  id: string;
  screeningId: string;
  festivalId: string;
  status: string;
  bookingConfirmation?: string;
  notes?: string;
  filmTitle?: string;
  filmId?: string;
  datetime?: string;
  cinemaId?: string;
  cinemaName?: string;
  addedAt: string;
  updatedAt: string;
}> {
  const schedule = useFestivalStore.getState().schedule;
  return Object.values(schedule).map((entry) => ({
    id: entry.id,
    screeningId: entry.screeningId,
    festivalId: entry.festivalId,
    status: entry.status,
    bookingConfirmation: entry.bookingConfirmation,
    notes: entry.notes,
    filmTitle: entry.filmTitle,
    filmId: entry.filmId,
    datetime: entry.datetime,
    cinemaId: entry.cinemaId,
    cinemaName: entry.cinemaName,
    addedAt: entry.addedAt,
    updatedAt: entry.updatedAt,
  }));
}

/**
 * Perform full bidirectional sync of festival data with server
 * 1. Send local state to server
 * 2. Server merges and returns merged state
 * 3. Apply merged state to local stores
 */
export async function performFestivalSync(): Promise<boolean> {
  try {
    const state = useFestivalStore.getState();

    const response = await fetch("/api/user/festivals/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        follows: followsToApiFormat(),
        schedule: scheduleToApiFormat(),
        updatedAt: state.updatedAt,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.log("[FestivalSync] User not authenticated, skipping sync");
        return false;
      }
      throw new Error(`Festival sync failed: ${response.status}`);
    }

    const data: FestivalSyncResponse = await response.json();

    // Apply merged follows
    if (data.follows) {
      useFestivalStore.getState().bulkSetFollows(data.follows);
    }

    // Apply merged schedule
    if (data.schedule) {
      useFestivalStore.getState().bulkSetSchedule(data.schedule);
    }

    console.log("[FestivalSync] Full sync completed successfully");
    return true;
  } catch (error) {
    console.error("[FestivalSync] Full sync failed:", error);
    return false;
  }
}

/**
 * Push only festival follows to server (for debounced updates)
 */
export async function pushFestivalFollows(): Promise<boolean> {
  try {
    const response = await fetch("/api/user/festivals/follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        follows: followsToApiFormat(),
      }),
    });

    if (!response.ok) {
      if (response.status === 401) return false;
      throw new Error(`Festival follows sync failed: ${response.status}`);
    }

    console.log("[FestivalSync] Follows pushed successfully");
    return true;
  } catch (error) {
    console.error("[FestivalSync] Follows push failed:", error);
    return false;
  }
}

/**
 * Push only festival schedule to server (for debounced updates)
 */
export async function pushFestivalSchedule(): Promise<boolean> {
  try {
    const response = await fetch("/api/user/festivals/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedule: scheduleToApiFormat(),
      }),
    });

    if (!response.ok) {
      if (response.status === 401) return false;
      throw new Error(`Festival schedule sync failed: ${response.status}`);
    }

    console.log("[FestivalSync] Schedule pushed successfully");
    return true;
  } catch (error) {
    console.error("[FestivalSync] Schedule push failed:", error);
    return false;
  }
}

/**
 * Follow a specific festival on server
 */
export async function followFestivalOnServer(festivalSlug: string): Promise<boolean> {
  const follows = useFestivalStore.getState().follows;
  const follow = Object.values(follows).find((f) => f.festivalSlug === festivalSlug);

  if (!follow) return false;

  try {
    const response = await fetch(`/api/festivals/${festivalSlug}/follow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        interestLevel: follow.interestLevel,
        notifyOnSale: follow.notifyOnSale,
        notifyProgramme: follow.notifyProgramme,
        notifyReminders: follow.notifyReminders,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) return false;
      throw new Error(`Festival follow failed: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error("[FestivalSync] Follow failed:", error);
    return false;
  }
}

/**
 * Unfollow a specific festival on server
 */
export async function unfollowFestivalOnServer(festivalSlug: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/festivals/${festivalSlug}/follow`, {
      method: "DELETE",
    });

    if (!response.ok) {
      if (response.status === 401) return false;
      // 404 is okay - already unfollowed
      if (response.status === 404) return true;
      throw new Error(`Festival unfollow failed: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error("[FestivalSync] Unfollow failed:", error);
    return false;
  }
}

/**
 * Update follow preferences for a specific festival
 */
export async function updateFollowPreferencesOnServer(
  festivalSlug: string,
  preferences: {
    interestLevel?: string;
    notifyOnSale?: boolean;
    notifyProgramme?: boolean;
    notifyReminders?: boolean;
  }
): Promise<boolean> {
  try {
    const response = await fetch(`/api/festivals/${festivalSlug}/follow`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences),
    });

    if (!response.ok) {
      if (response.status === 401) return false;
      throw new Error(`Festival preferences update failed: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error("[FestivalSync] Preferences update failed:", error);
    return false;
  }
}
