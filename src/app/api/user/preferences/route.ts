import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { BadRequestError, handleApiError } from "@/lib/api-errors";
import { z } from "zod";

const storedPreferencesSchema = z.object({
  selectedCinemas: z.array(z.string().max(100)).max(100),
  defaultView: z.enum(["list", "grid"]),
  showRepertoryOnly: z.boolean(),
  hidePastScreenings: z.boolean(),
  defaultDateRange: z.enum(["today", "tomorrow", "week", "weekend", "all"]),
  preferredFormats: z.array(z.string().max(50)).max(20),
});

const storedFiltersSchema = z.object({
  cinemaIds: z.array(z.string().max(100)).max(100),
  formats: z.array(z.string().max(50)).max(20),
  programmingTypes: z.array(z.enum(["repertory", "new_release", "special_event", "preview"])).max(20),
  decades: z.array(z.string().max(10)).max(20),
  genres: z.array(z.string().max(50)).max(50),
  timesOfDay: z.array(z.enum(["morning", "afternoon", "evening", "late_night"])).max(10),
  hideSeen: z.boolean(),
  hideNotInterested: z.boolean(),
});

const updatePreferencesSchema = z.object({
  preferences: storedPreferencesSchema,
  persistedFilters: storedFiltersSchema,
  updatedAt: z.string().datetime(),
});

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

/**
 * PUT /api/user/preferences - Update user preferences
 */
export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const parseResult = updatePreferencesSchema.safeParse(await request.json());
    if (!parseResult.success) {
      throw new BadRequestError("Invalid request body", parseResult.error.flatten());
    }
    const { preferences, persistedFilters, updatedAt } = parseResult.data;

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
