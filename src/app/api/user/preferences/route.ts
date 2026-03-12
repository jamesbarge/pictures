import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";
import type { StoredPreferences, StoredFilters } from "@/db/schema/user-preferences";

/**
 * GET /api/user/preferences - Fetch user preferences
 */
export async function GET() {
  try {
    const userId = await requireAuth();

    const prefs = await db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, userId),
    });

    if (!prefs) {
      return NextResponse.json({
        preferences: null,
        persistedFilters: null,
        updatedAt: null,
      });
    }

    return NextResponse.json({
      preferences: prefs.preferences,
      persistedFilters: prefs.persistedFilters,
      updatedAt: prefs.updatedAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/user/preferences");
  }
}

interface PreferencesPayload {
  preferences: StoredPreferences;
  persistedFilters: StoredFilters;
  updatedAt: string;
}

/**
 * PUT /api/user/preferences - Update user preferences
 */
export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = (await request.json()) as PreferencesPayload;

    const { preferences, persistedFilters, updatedAt } = body;

    // Check if entry exists
    const existing = await db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, userId),
    });

    if (existing) {
      // Compare timestamps - only update if incoming is newer
      const existingTime = new Date(existing.updatedAt).getTime();
      const incomingTime = new Date(updatedAt).getTime();

      if (incomingTime > existingTime) {
        await db
          .update(userPreferences)
          .set({
            preferences,
            persistedFilters,
            updatedAt: new Date(updatedAt),
          })
          .where(eq(userPreferences.userId, userId));
      }
    } else {
      // Insert new
      await db.insert(userPreferences).values({
        userId,
        preferences,
        persistedFilters,
        updatedAt: new Date(updatedAt),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "PUT /api/user/preferences");
  }
}
