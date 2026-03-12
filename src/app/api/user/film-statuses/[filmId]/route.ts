import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userFilmStatuses } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";
import { syncUserToPostHog } from "@/lib/posthog-supabase-sync";

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
    const body = await request.json();

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
    } = body;

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
