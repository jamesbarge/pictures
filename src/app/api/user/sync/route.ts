import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, userFilmStatuses, userPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import { currentUser } from "@clerk/nextjs/server";
import type { StoredPreferences, StoredFilters } from "@/db/schema/user-preferences";
import { RateLimitError, handleApiError } from "@/lib/api-errors";
import { captureServerEvent, setServerUserProperties } from "@/lib/posthog-server";

interface FilmStatusPayload {
  filmId: string;
  status: "want_to_see" | "seen" | "not_interested";
  addedAt: string;
  seenAt?: string | null;
  rating?: number | null;
  notes?: string | null;
  filmTitle?: string | null;
  filmYear?: number | null;
  filmDirectors?: string[] | null;
  filmPosterUrl?: string | null;
  updatedAt: string;
}

interface SyncRequest {
  filmStatuses: FilmStatusPayload[];
  preferences: StoredPreferences | null;
  persistedFilters: StoredFilters | null;
  preferencesUpdatedAt: string | null;
}

/**
 * POST /api/user/sync - Full bidirectional sync
 *
 * This endpoint:
 * 1. Ensures the user record exists
 * 2. Merges client film statuses with server (timestamp-based)
 * 3. Merges client preferences with server (timestamp-based)
 * 4. Returns the merged data for client to apply
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit check
    const ip = getClientIP(request);
    const rateLimitResult = checkRateLimit(ip, { ...RATE_LIMITS.sync, prefix: "sync" });
    if (!rateLimitResult.success) {
      throw new RateLimitError(
        "Too many requests. Please try again later.",
        rateLimitResult.resetIn
      );
    }

    const userId = await requireAuth();
    const clerkUser = await currentUser();
    const body = (await request.json()) as SyncRequest;

    // 1. Ensure user record exists
    let user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const [newUser] = await db
        .insert(users)
        .values({
          id: userId,
          email: clerkUser?.emailAddresses[0]?.emailAddress || null,
          displayName: clerkUser?.firstName
            ? `${clerkUser.firstName}${clerkUser.lastName ? ` ${clerkUser.lastName}` : ""}`
            : null,
        })
        .returning();
      user = newUser;

      // Track user creation server-side
      captureServerEvent(userId, "user_created", {
        source: "sync",
        email_domain: clerkUser?.emailAddresses[0]?.emailAddress?.split("@")[1],
        has_name: !!clerkUser?.firstName,
      });

      // Set initial user properties
      setServerUserProperties(userId, {
        created_at: new Date().toISOString(),
        signup_source: "sync",
        email: clerkUser?.emailAddresses[0]?.emailAddress,
        name: clerkUser?.fullName,
      });
    }

    // 2. Merge film statuses
    const serverStatuses = await db.query.userFilmStatuses.findMany({
      where: eq(userFilmStatuses.userId, userId),
    });

    const mergedStatuses: Record<string, FilmStatusPayload> = {};

    // First, add all server statuses
    for (const status of serverStatuses) {
      mergedStatuses[status.filmId] = {
        filmId: status.filmId,
        status: status.status,
        addedAt: status.addedAt.toISOString(),
        seenAt: status.seenAt?.toISOString() || null,
        rating: status.rating,
        notes: status.notes,
        filmTitle: status.filmTitle,
        filmYear: status.filmYear,
        filmDirectors: status.filmDirectors,
        filmPosterUrl: status.filmPosterUrl,
        updatedAt: status.updatedAt.toISOString(),
      };
    }

    // Then, merge client statuses (newer wins)
    const statusesToUpsert: FilmStatusPayload[] = [];

    for (const clientStatus of body.filmStatuses) {
      const serverStatus = mergedStatuses[clientStatus.filmId];

      if (!serverStatus) {
        // New on client, add to merged and upsert
        mergedStatuses[clientStatus.filmId] = clientStatus;
        statusesToUpsert.push(clientStatus);
      } else {
        // Compare timestamps
        const clientTime = new Date(clientStatus.updatedAt).getTime();
        const serverTime = new Date(serverStatus.updatedAt).getTime();

        if (clientTime > serverTime) {
          // Client is newer - update server and merged
          mergedStatuses[clientStatus.filmId] = clientStatus;
          statusesToUpsert.push(clientStatus);
        }
        // else: server is newer - already in mergedStatuses
      }
    }

    // Upsert client changes to server
    for (const status of statusesToUpsert) {
      const existing = serverStatuses.find((s) => s.filmId === status.filmId);

      if (existing) {
        await db
          .update(userFilmStatuses)
          .set({
            status: status.status,
            addedAt: new Date(status.addedAt),
            seenAt: status.seenAt ? new Date(status.seenAt) : null,
            rating: status.rating,
            notes: status.notes,
            filmTitle: status.filmTitle,
            filmYear: status.filmYear,
            filmDirectors: status.filmDirectors,
            filmPosterUrl: status.filmPosterUrl,
            updatedAt: new Date(status.updatedAt),
          })
          .where(eq(userFilmStatuses.id, existing.id));
      } else {
        await db.insert(userFilmStatuses).values({
          userId,
          filmId: status.filmId,
          status: status.status,
          addedAt: new Date(status.addedAt),
          seenAt: status.seenAt ? new Date(status.seenAt) : null,
          rating: status.rating,
          notes: status.notes,
          filmTitle: status.filmTitle,
          filmYear: status.filmYear,
          filmDirectors: status.filmDirectors,
          filmPosterUrl: status.filmPosterUrl,
          updatedAt: new Date(status.updatedAt),
        });
      }
    }

    // 3. Merge preferences
    const serverPrefs = await db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, userId),
    });

    let mergedPreferences: StoredPreferences | null = null;
    let mergedFilters: StoredFilters | null = null;
    let preferencesUpdatedAt: string | null = null;

    if (!serverPrefs && body.preferences) {
      // No server preferences, use client
      await db.insert(userPreferences).values({
        userId,
        preferences: body.preferences,
        persistedFilters: body.persistedFilters || {
          cinemaIds: [],
          formats: [],
          programmingTypes: [],
          decades: [],
          genres: [],
          timesOfDay: [],
          hideSeen: false,
          hideNotInterested: true,
        },
        updatedAt: new Date(body.preferencesUpdatedAt || Date.now()),
      });

      mergedPreferences = body.preferences;
      mergedFilters = body.persistedFilters;
      preferencesUpdatedAt = body.preferencesUpdatedAt;
    } else if (serverPrefs) {
      const serverTime = new Date(serverPrefs.updatedAt).getTime();
      const clientTime = body.preferencesUpdatedAt
        ? new Date(body.preferencesUpdatedAt).getTime()
        : 0;

      if (body.preferences && clientTime > serverTime) {
        // Client is newer - update server
        await db
          .update(userPreferences)
          .set({
            preferences: body.preferences,
            persistedFilters: body.persistedFilters || serverPrefs.persistedFilters,
            updatedAt: new Date(body.preferencesUpdatedAt!),
          })
          .where(eq(userPreferences.userId, userId));

        mergedPreferences = body.preferences;
        mergedFilters = body.persistedFilters || serverPrefs.persistedFilters;
        preferencesUpdatedAt = body.preferencesUpdatedAt;
      } else {
        // Server is newer or no client prefs
        mergedPreferences = serverPrefs.preferences;
        mergedFilters = serverPrefs.persistedFilters;
        preferencesUpdatedAt = serverPrefs.updatedAt.toISOString();
      }
    }

    return NextResponse.json({
      success: true,
      isNewUser,
      filmStatuses: mergedStatuses,
      preferences: mergedPreferences,
      persistedFilters: mergedFilters,
      preferencesUpdatedAt,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/user/sync");
  }
}
