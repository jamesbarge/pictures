/**
 * Supabase → PostHog Sync
 *
 * Enriches PostHog user profiles with data from Supabase.
 * This enables powerful segmentation and targeting based on actual product data.
 *
 * Benefits:
 * - Segment users by watchlist size, favorite cinemas, engagement level
 * - Target surveys/experiments to specific user types
 * - See product metrics alongside behavior in PostHog
 * - Build cohorts based on database state
 */

import { db } from "@/db";
import { userFilmStatuses, userPreferences } from "@/db/schema";
import { eq, count, desc, asc } from "drizzle-orm";
import { getPostHogServer, setServerUserProperties, captureServerEvent } from "./posthog-server";

interface UserProductData {
  // Watchlist metrics
  watchlistCount: number;
  seenCount: number;
  notInterestedCount: number;
  totalFilmInteractions: number;

  // Engagement tier
  engagementTier: "new" | "casual" | "engaged" | "power_user";

  // Preferences
  favoriteCinemas: string[];
  favoriteCinemaCount: number;

  // Activity timestamps
  firstInteractionAt: string | null;
  lastInteractionAt: string | null;
}

/**
 * Calculate engagement tier based on activity
 */
function calculateEngagementTier(
  watchlistCount: number,
  seenCount: number
): UserProductData["engagementTier"] {
  const total = watchlistCount + seenCount;

  if (total === 0) return "new";
  if (total < 5) return "casual";
  if (total < 20) return "engaged";
  return "power_user";
}

/**
 * Fetch user product data from Supabase
 */
export async function getUserProductData(userId: string): Promise<UserProductData | null> {
  try {
    // Get film status counts
    const statusCounts = await db
      .select({
        status: userFilmStatuses.status,
        count: count(),
      })
      .from(userFilmStatuses)
      .where(eq(userFilmStatuses.userId, userId))
      .groupBy(userFilmStatuses.status);

    const watchlistCount = statusCounts.find(s => s.status === "want_to_see")?.count ?? 0;
    const seenCount = statusCounts.find(s => s.status === "seen")?.count ?? 0;
    const notInterestedCount = statusCounts.find(s => s.status === "not_interested")?.count ?? 0;

    // Get first interaction timestamp (oldest)
    const firstInteraction = await db
      .select({
        firstAt: userFilmStatuses.addedAt,
      })
      .from(userFilmStatuses)
      .where(eq(userFilmStatuses.userId, userId))
      .orderBy(asc(userFilmStatuses.addedAt))
      .limit(1);

    // Get last interaction timestamp (newest)
    const lastInteraction = await db
      .select({
        lastAt: userFilmStatuses.updatedAt,
      })
      .from(userFilmStatuses)
      .where(eq(userFilmStatuses.userId, userId))
      .orderBy(desc(userFilmStatuses.updatedAt))
      .limit(1);

    // Get user preferences (favorite cinemas)
    const preferences = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    const favoriteCinemas = preferences[0]?.preferences?.selectedCinemas ?? [];

    return {
      watchlistCount,
      seenCount,
      notInterestedCount,
      totalFilmInteractions: watchlistCount + seenCount + notInterestedCount,
      engagementTier: calculateEngagementTier(watchlistCount, seenCount),
      favoriteCinemas,
      favoriteCinemaCount: favoriteCinemas.length,
      firstInteractionAt: firstInteraction[0]?.firstAt?.toISOString() ?? null,
      lastInteractionAt: lastInteraction[0]?.lastAt?.toISOString() ?? null,
    };
  } catch (error) {
    console.error("[PostHog Sync] Failed to fetch user product data:", error);
    return null;
  }
}

/**
 * Sync a user's product data to PostHog
 * Call this after significant user actions (watchlist change, signup, etc.)
 */
export async function syncUserToPostHog(userId: string): Promise<boolean> {
  const client = getPostHogServer();
  if (!client) {
    console.warn("[PostHog Sync] PostHog client not available");
    return false;
  }

  const productData = await getUserProductData(userId);
  if (!productData) {
    return false;
  }

  // Send user properties to PostHog
  setServerUserProperties(userId, {
    // Watchlist metrics (prefix with $ to make them person properties)
    watchlist_count: productData.watchlistCount,
    seen_count: productData.seenCount,
    not_interested_count: productData.notInterestedCount,
    total_film_interactions: productData.totalFilmInteractions,

    // Engagement
    engagement_tier: productData.engagementTier,

    // Preferences
    favorite_cinemas: productData.favoriteCinemas,
    favorite_cinema_count: productData.favoriteCinemaCount,

    // Timestamps
    first_interaction_at: productData.firstInteractionAt,
    last_interaction_at: productData.lastInteractionAt,

    // Sync metadata
    last_supabase_sync: new Date().toISOString(),
  });

  return true;
}

/**
 * Sync all users to PostHog (batch job)
 * Run this periodically (e.g., daily via cron) to keep PostHog in sync
 */
export async function syncAllUsersToPostHog(): Promise<{
  synced: number;
  failed: number;
}> {
  const client = getPostHogServer();
  if (!client) {
    console.warn("[PostHog Sync] PostHog client not available");
    return { synced: 0, failed: 0 };
  }

  // Get all unique user IDs from film statuses
  const users = await db
    .selectDistinct({ userId: userFilmStatuses.userId })
    .from(userFilmStatuses);

  let synced = 0;
  let failed = 0;

  for (const { userId } of users) {
    const success = await syncUserToPostHog(userId);
    if (success) {
      synced++;
    } else {
      failed++;
    }
  }

  // Track the sync event
  captureServerEvent("system", "supabase_posthog_sync_completed", {
    users_synced: synced,
    users_failed: failed,
    total_users: users.length,
  });

  return { synced, failed };
}

/**
 * Track a server-side event with product context
 * Use this for events that happen on the server (API routes, webhooks)
 */
export async function trackServerEventWithContext(
  userId: string,
  event: string,
  properties?: Record<string, unknown>
): Promise<void> {
  const productData = await getUserProductData(userId);

  captureServerEvent(userId, event, {
    ...properties,
    // Include product context
    $set: productData ? {
      watchlist_count: productData.watchlistCount,
      engagement_tier: productData.engagementTier,
    } : undefined,
  });
}
