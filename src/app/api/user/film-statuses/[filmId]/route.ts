import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userFilmStatuses } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { BadRequestError, handleApiError } from "@/lib/api-errors";
import { syncUserToPostHog } from "@/lib/posthog-supabase-sync";
import { z } from "zod";

const updateFilmStatusSchema = z.object({
  status: z.enum(["want_to_see", "seen", "not_interested"]),
  addedAt: z.string().datetime().optional(),
  seenAt: z.string().datetime().nullable().optional(),
  rating: z.number().int().min(0).max(5).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  filmTitle: z.string().max(200).nullable().optional(),
  filmYear: z.number().int().min(1888).max(2100).nullable().optional(),
  filmDirectors: z.array(z.string().max(200)).max(20).nullable().optional(),
  filmPosterUrl: z.string().url().max(500).nullable().optional(),
  updatedAt: z.string().datetime().optional(),
});

interface RouteParams {
  params: Promise<{ filmId: string }>;
}

/**
 * PUT /api/user/film-statuses/[filmId] - Update a single film status
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth();
    const { filmId } = await params;
    const parseResult = updateFilmStatusSchema.safeParse(await request.json());
    if (!parseResult.success) {
      throw new BadRequestError("Invalid request body", parseResult.error.flatten());
    }
    const {
      status,
      addedAt,
      seenAt,
      rating,
      notes,
      filmTitle,
      filmYear,
      filmDirectors,
      filmPosterUrl,
      updatedAt,
    } = parseResult.data;

    // Check if entry exists
    const existing = await db.query.userFilmStatuses.findFirst({
      where: and(
        eq(userFilmStatuses.userId, userId),
        eq(userFilmStatuses.filmId, filmId)
      ),
    });

    if (existing) {
      // Update existing
      await db
        .update(userFilmStatuses)
        .set({
          status,
          addedAt: addedAt ? new Date(addedAt) : undefined,
          seenAt: seenAt ? new Date(seenAt) : null,
          rating: rating ?? null,
          notes: notes ?? null,
          filmTitle: filmTitle ?? null,
          filmYear: filmYear ?? null,
          filmDirectors: filmDirectors ?? null,
          filmPosterUrl: filmPosterUrl ?? null,
          updatedAt: new Date(updatedAt || Date.now()),
        })
        .where(eq(userFilmStatuses.id, existing.id));
    } else {
      // Insert new
      await db.insert(userFilmStatuses).values({
        userId,
        filmId,
        status,
        addedAt: new Date(addedAt || Date.now()),
        seenAt: seenAt ? new Date(seenAt) : null,
        rating: rating ?? null,
        notes: notes ?? null,
        filmTitle: filmTitle ?? null,
        filmYear: filmYear ?? null,
        filmDirectors: filmDirectors ?? null,
        filmPosterUrl: filmPosterUrl ?? null,
        updatedAt: new Date(updatedAt || Date.now()),
      });
    }

    // Sync updated user metrics to PostHog (async, non-blocking)
    syncUserToPostHog(userId).catch((err) => {
      console.error("[PostHog Sync] Failed to sync user data:", err);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "PUT /api/user/film-statuses/[filmId]");
  }
}

/**
 * DELETE /api/user/film-statuses/[filmId] - Remove a film status
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth();
    const { filmId } = await params;

    await db
      .delete(userFilmStatuses)
      .where(
        and(
          eq(userFilmStatuses.userId, userId),
          eq(userFilmStatuses.filmId, filmId)
        )
      );

    // Sync updated user metrics to PostHog (async, non-blocking)
    syncUserToPostHog(userId).catch((err) => {
      console.error("[PostHog Sync] Failed to sync user data:", err);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/user/film-statuses/[filmId]");
  }
}
