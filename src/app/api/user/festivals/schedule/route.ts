/**
 * Festival Schedule API Route
 * POST /api/user/festivals/schedule - Push festival schedule to server
 * GET /api/user/festivals/schedule - Get user's festival schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userFestivalSchedule, screenings, films, cinemas } from "@/db/schema";
import type { FestivalScheduleStatus } from "@/db/schema/festivals";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { BadRequestError, handleApiError } from "@/lib/api-errors";
import { requireAuth, getCurrentUserId } from "@/lib/auth";

// Schema for incoming schedule
const scheduleSchema = z.object({
  schedule: z.array(
    z.object({
      id: z.string(),
      screeningId: z.string(),
      festivalId: z.string(),
      status: z.enum(["wishlist", "booked", "attended", "missed"]),
      bookingConfirmation: z.string().optional(),
      notes: z.string().optional(),
      filmTitle: z.string().optional(),
      filmId: z.string().optional(),
      datetime: z.string().optional(),
      cinemaId: z.string().optional(),
      cinemaName: z.string().optional(),
      addedAt: z.string(),
      updatedAt: z.string(),
    })
  ),
});

/**
 * GET - Get user's festival schedule
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ schedule: {} });
    }

    const scheduleEntries = await db
      .select({
        id: userFestivalSchedule.id,
        screeningId: userFestivalSchedule.screeningId,
        festivalId: userFestivalSchedule.festivalId,
        status: userFestivalSchedule.status,
        bookingConfirmation: userFestivalSchedule.bookingConfirmation,
        notes: userFestivalSchedule.notes,
        addedAt: userFestivalSchedule.createdAt,
        updatedAt: userFestivalSchedule.updatedAt,
        // Join screening data
        datetime: screenings.datetime,
        // Join film data
        filmId: films.id,
        filmTitle: films.title,
        // Join cinema data
        cinemaId: cinemas.id,
        cinemaName: cinemas.name,
      })
      .from(userFestivalSchedule)
      .leftJoin(screenings, eq(userFestivalSchedule.screeningId, screenings.id))
      .leftJoin(films, eq(screenings.filmId, films.id))
      .leftJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
      .where(eq(userFestivalSchedule.userId, userId));

    // Transform to client format
    const result: Record<
      string,
      {
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
      }
    > = {};

    for (const entry of scheduleEntries) {
      result[entry.screeningId] = {
        id: entry.id,
        screeningId: entry.screeningId,
        festivalId: entry.festivalId,
        status: entry.status,
        bookingConfirmation: entry.bookingConfirmation || undefined,
        notes: entry.notes || undefined,
        filmTitle: entry.filmTitle || undefined,
        filmId: entry.filmId || undefined,
        datetime: entry.datetime?.toISOString() || undefined,
        cinemaId: entry.cinemaId || undefined,
        cinemaName: entry.cinemaName || undefined,
        addedAt: entry.addedAt?.toISOString() || new Date().toISOString(),
        updatedAt: entry.updatedAt?.toISOString() || new Date().toISOString(),
      };
    }

    return NextResponse.json({ schedule: result });
  } catch (error) {
    return handleApiError(error, "GET /api/user/festivals/schedule");
  }
}

/**
 * POST - Push festival schedule to server
 * This is a full replace - client state becomes server state
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();

    // Parse and validate body
    const body = await request.json().catch(() => ({}));
    const parseResult = scheduleSchema.safeParse(body);

    if (!parseResult.success) {
      throw new BadRequestError("Invalid schedule data", parseResult.error.flatten());
    }

    const { schedule } = parseResult.data;

    // Get current server schedule
    const serverSchedule = await db
      .select({ screeningId: userFestivalSchedule.screeningId })
      .from(userFestivalSchedule)
      .where(eq(userFestivalSchedule.userId, userId));

    const serverScheduleIds = serverSchedule.map((s) => s.screeningId);
    const clientScheduleIds = schedule.map((s) => s.screeningId);

    // Delete schedule entries that are no longer in client state
    const toDelete = serverScheduleIds.filter((id) => !clientScheduleIds.includes(id));
    if (toDelete.length > 0) {
      await db
        .delete(userFestivalSchedule)
        .where(
          and(
            eq(userFestivalSchedule.userId, userId),
            inArray(userFestivalSchedule.screeningId, toDelete)
          )
        );
    }

    // Upsert all client schedule entries
    for (const entry of schedule) {
      const status = entry.status as FestivalScheduleStatus;
      await db
        .insert(userFestivalSchedule)
        .values({
          id: entry.id,
          userId,
          screeningId: entry.screeningId,
          festivalId: entry.festivalId,
          status,
          bookingConfirmation: entry.bookingConfirmation || null,
          notes: entry.notes || null,
        })
        .onConflictDoUpdate({
          target: [userFestivalSchedule.userId, userFestivalSchedule.screeningId],
          set: {
            status,
            bookingConfirmation: entry.bookingConfirmation || null,
            notes: entry.notes || null,
            updatedAt: new Date(),
          },
        });
    }

    return NextResponse.json({
      success: true,
      count: schedule.length,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/user/festivals/schedule");
  }
}
