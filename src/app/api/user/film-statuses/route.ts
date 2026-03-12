import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userFilmStatuses } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-errors";
import { z } from "zod";

// Validation schema for film status
const filmStatusSchema = z.object({
  filmId: z.string().uuid(),
  status: z.enum(["want_to_see", "seen", "not_interested"]),
  addedAt: z.string().datetime(),
  seenAt: z.string().datetime().nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  filmTitle: z.string().max(500).nullable().optional(),
  filmYear: z.number().int().min(1800).max(2100).nullable().optional(),
  filmDirectors: z.array(z.string().max(200)).nullable().optional(),
  filmPosterUrl: z.string().url().max(500).nullable().optional(),
  updatedAt: z.string().datetime(),
});

// Validation for POST body
const postBodySchema = z.object({
  statuses: z.array(filmStatusSchema).max(500), // Limit batch size
});

/**
 * GET /api/user/film-statuses - Fetch all film statuses for the current user
 */
export async function GET() {
  try {
    const userId = await requireAuth();

    const statuses = await db.query.userFilmStatuses.findMany({
      where: eq(userFilmStatuses.userId, userId),
    });

    // Transform to a map format for easy client-side merging
    const statusMap: Record<string, typeof statuses[number]> = {};
    for (const status of statuses) {
      statusMap[status.filmId] = status;
    }

    return NextResponse.json({ statuses: statusMap });
  } catch (error) {
    return handleApiError(error, "GET /api/user/film-statuses");
  }
}

// Type exported for use in other modules if needed
export type FilmStatusPayload = z.infer<typeof filmStatusSchema>;

/**
 * POST /api/user/film-statuses - Bulk upsert film statuses
 * Used for syncing local state to server
 *
 * Optimized: Uses batch fetch + conditional upsert instead of N+1 queries
 * Before: 2N queries (check + update/insert per status)
 * After: 2 queries (fetch all existing + batch upsert)
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await request.json();

    // Validate request body
    const parseResult = postBodySchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { statuses } = parseResult.data;

    if (statuses.length === 0) {
      return NextResponse.json({ success: true, results: { processed: 0, skipped: 0 } });
    }

    // 1. Fetch all existing statuses for this user in ONE query
    const existingStatuses = await db.query.userFilmStatuses.findMany({
      where: eq(userFilmStatuses.userId, userId),
    });

    // Build a map for O(1) lookups
    const existingMap = new Map(
      existingStatuses.map((s) => [s.filmId, s])
    );

    // 2. Filter statuses to only those that need updating (incoming is newer)
    const toUpsert = statuses.filter((status) => {
      const existing = existingMap.get(status.filmId);
      if (!existing) return true; // New entry, always insert

      // Only update if incoming timestamp is newer
      const existingTime = new Date(existing.updatedAt).getTime();
      const incomingTime = new Date(status.updatedAt).getTime();
      return incomingTime > existingTime;
    });

    if (toUpsert.length === 0) {
      return NextResponse.json({
        success: true,
        results: { processed: 0, skipped: statuses.length }
      });
    }

    // 3. Batch upsert using ON CONFLICT DO UPDATE
    // This handles both inserts and updates in a single query
    await db
      .insert(userFilmStatuses)
      .values(
        toUpsert.map((status) => ({
          userId,
          filmId: status.filmId,
          status: status.status,
          addedAt: new Date(status.addedAt),
          seenAt: status.seenAt ? new Date(status.seenAt) : null,
          rating: status.rating ?? null,
          notes: status.notes ?? null,
          filmTitle: status.filmTitle ?? null,
          filmYear: status.filmYear ?? null,
          filmDirectors: status.filmDirectors ?? null,
          filmPosterUrl: status.filmPosterUrl ?? null,
          updatedAt: new Date(status.updatedAt),
        }))
      )
      .onConflictDoUpdate({
        target: [userFilmStatuses.userId, userFilmStatuses.filmId],
        set: {
          status: sql`excluded.status`,
          addedAt: sql`excluded.added_at`,
          seenAt: sql`excluded.seen_at`,
          rating: sql`excluded.rating`,
          notes: sql`excluded.notes`,
          filmTitle: sql`excluded.film_title`,
          filmYear: sql`excluded.film_year`,
          filmDirectors: sql`excluded.film_directors`,
          filmPosterUrl: sql`excluded.film_poster_url`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    return NextResponse.json({
      success: true,
      results: {
        processed: toUpsert.length,
        skipped: statuses.length - toUpsert.length
      }
    });
  } catch (error) {
    return handleApiError(error, "POST /api/user/film-statuses");
  }
}
