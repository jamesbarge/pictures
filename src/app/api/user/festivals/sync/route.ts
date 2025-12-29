/**
 * Festival Sync API Route
 * POST /api/user/festivals/sync - Bidirectional sync of follows and schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userFestivalInterests, userFestivalSchedule, festivals } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { BadRequestError, handleApiError } from "@/lib/api-errors";
import { requireAuth } from "@/lib/auth";
import type { FestivalInterestLevel, FestivalScheduleStatus } from "@/db/schema/festivals";

// Schema for incoming sync data
const syncSchema = z.object({
  follows: z
    .array(
      z.object({
        festivalId: z.string(),
        festivalName: z.string(),
        festivalSlug: z.string(),
        interestLevel: z.enum(["following", "highly_interested", "attending"]),
        notifyOnSale: z.boolean(),
        notifyProgramme: z.boolean(),
        notifyReminders: z.boolean(),
        followedAt: z.string(),
        updatedAt: z.string(),
      })
    )
    .optional()
    .default([]),
  schedule: z
    .array(
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
    )
    .optional()
    .default([]),
  updatedAt: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();

    // Parse and validate body
    const body = await request.json().catch(() => ({}));
    const parseResult = syncSchema.safeParse(body);

    if (!parseResult.success) {
      throw new BadRequestError("Invalid sync data", parseResult.error.flatten());
    }

    const { follows: clientFollows, schedule: clientSchedule } = parseResult.data;

    // Get existing server data
    const serverFollows = await db
      .select()
      .from(userFestivalInterests)
      .where(eq(userFestivalInterests.userId, userId));

    const serverSchedule = await db
      .select()
      .from(userFestivalSchedule)
      .where(eq(userFestivalSchedule.userId, userId));

    // Convert server follows to map
    const serverFollowsMap = new Map(
      serverFollows.map((f) => [f.festivalId, f])
    );

    // Convert server schedule to map
    const serverScheduleMap = new Map(
      serverSchedule.map((s) => [s.screeningId, s])
    );

    // Merge follows - timestamp-based, newest wins
    const mergedFollows: Record<
      string,
      {
        festivalId: string;
        festivalName: string;
        festivalSlug: string;
        interestLevel: FestivalInterestLevel;
        notifyOnSale: boolean;
        notifyProgramme: boolean;
        notifyReminders: boolean;
        followedAt: string;
        updatedAt: string;
      }
    > = {};

    // Add all client follows
    for (const clientFollow of clientFollows) {
      const serverFollow = serverFollowsMap.get(clientFollow.festivalId);

      if (!serverFollow) {
        // Only on client - add to server
        mergedFollows[clientFollow.festivalId] = clientFollow;
      } else {
        // On both - compare timestamps
        const clientTime = new Date(clientFollow.updatedAt).getTime();
        const serverTime = serverFollow.updatedAt
          ? new Date(serverFollow.updatedAt).getTime()
          : 0;

        if (clientTime >= serverTime) {
          mergedFollows[clientFollow.festivalId] = clientFollow;
        } else {
          // Server wins - need to get festival metadata
          const [festival] = await db
            .select({ name: festivals.name, slug: festivals.slug })
            .from(festivals)
            .where(eq(festivals.id, serverFollow.festivalId))
            .limit(1);

          mergedFollows[clientFollow.festivalId] = {
            festivalId: serverFollow.festivalId,
            festivalName: festival?.name || clientFollow.festivalName,
            festivalSlug: festival?.slug || clientFollow.festivalSlug,
            interestLevel: serverFollow.interestLevel as FestivalInterestLevel,
            notifyOnSale: serverFollow.notifyOnSale,
            notifyProgramme: serverFollow.notifyProgramme,
            notifyReminders: serverFollow.notifyReminders,
            followedAt: serverFollow.createdAt?.toISOString() || clientFollow.followedAt,
            updatedAt: serverFollow.updatedAt?.toISOString() || clientFollow.updatedAt,
          };
        }
      }
    }

    // Add server-only follows (not on client)
    for (const serverFollow of serverFollows) {
      if (!clientFollows.find((cf) => cf.festivalId === serverFollow.festivalId)) {
        // Get festival metadata
        const [festival] = await db
          .select({ name: festivals.name, slug: festivals.slug })
          .from(festivals)
          .where(eq(festivals.id, serverFollow.festivalId))
          .limit(1);

        if (festival) {
          mergedFollows[serverFollow.festivalId] = {
            festivalId: serverFollow.festivalId,
            festivalName: festival.name,
            festivalSlug: festival.slug,
            interestLevel: serverFollow.interestLevel as FestivalInterestLevel,
            notifyOnSale: serverFollow.notifyOnSale,
            notifyProgramme: serverFollow.notifyProgramme,
            notifyReminders: serverFollow.notifyReminders,
            followedAt: serverFollow.createdAt?.toISOString() || new Date().toISOString(),
            updatedAt: serverFollow.updatedAt?.toISOString() || new Date().toISOString(),
          };
        }
      }
    }

    // Merge schedule - timestamp-based, newest wins
    const mergedSchedule: Record<
      string,
      {
        id: string;
        screeningId: string;
        festivalId: string;
        status: FestivalScheduleStatus;
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

    // Add all client schedule entries
    for (const clientEntry of clientSchedule) {
      const serverEntry = serverScheduleMap.get(clientEntry.screeningId);

      if (!serverEntry) {
        // Only on client - add to merged
        mergedSchedule[clientEntry.screeningId] = {
          ...clientEntry,
          status: clientEntry.status as FestivalScheduleStatus,
        };
      } else {
        // On both - compare timestamps
        const clientTime = new Date(clientEntry.updatedAt).getTime();
        const serverTime = serverEntry.updatedAt
          ? new Date(serverEntry.updatedAt).getTime()
          : 0;

        if (clientTime >= serverTime) {
          mergedSchedule[clientEntry.screeningId] = {
            ...clientEntry,
            status: clientEntry.status as FestivalScheduleStatus,
          };
        } else {
          // Server wins
          mergedSchedule[clientEntry.screeningId] = {
            id: serverEntry.id,
            screeningId: serverEntry.screeningId,
            festivalId: serverEntry.festivalId,
            status: serverEntry.status as FestivalScheduleStatus,
            bookingConfirmation: serverEntry.bookingConfirmation || undefined,
            notes: serverEntry.notes || undefined,
            addedAt: serverEntry.createdAt?.toISOString() || clientEntry.addedAt,
            updatedAt: serverEntry.updatedAt?.toISOString() || clientEntry.updatedAt,
          };
        }
      }
    }

    // Add server-only schedule entries (not on client)
    for (const serverEntry of serverSchedule) {
      if (!clientSchedule.find((cs) => cs.screeningId === serverEntry.screeningId)) {
        mergedSchedule[serverEntry.screeningId] = {
          id: serverEntry.id,
          screeningId: serverEntry.screeningId,
          festivalId: serverEntry.festivalId,
          status: serverEntry.status as FestivalScheduleStatus,
          bookingConfirmation: serverEntry.bookingConfirmation || undefined,
          notes: serverEntry.notes || undefined,
          addedAt: serverEntry.createdAt?.toISOString() || new Date().toISOString(),
          updatedAt: serverEntry.updatedAt?.toISOString() || new Date().toISOString(),
        };
      }
    }

    // Persist merged follows to server
    // Delete removed follows
    const mergedFollowIds = Object.keys(mergedFollows);
    const serverFollowIds = serverFollows.map((f) => f.festivalId);
    const removedFollowIds = serverFollowIds.filter((id) => !mergedFollowIds.includes(id));

    if (removedFollowIds.length > 0) {
      await db
        .delete(userFestivalInterests)
        .where(
          and(
            eq(userFestivalInterests.userId, userId),
            inArray(userFestivalInterests.festivalId, removedFollowIds)
          )
        );
    }

    // Upsert merged follows
    for (const follow of Object.values(mergedFollows)) {
      await db
        .insert(userFestivalInterests)
        .values({
          userId,
          festivalId: follow.festivalId,
          interestLevel: follow.interestLevel,
          notifyOnSale: follow.notifyOnSale,
          notifyProgramme: follow.notifyProgramme,
          notifyReminders: follow.notifyReminders,
        })
        .onConflictDoUpdate({
          target: [userFestivalInterests.userId, userFestivalInterests.festivalId],
          set: {
            interestLevel: follow.interestLevel,
            notifyOnSale: follow.notifyOnSale,
            notifyProgramme: follow.notifyProgramme,
            notifyReminders: follow.notifyReminders,
            updatedAt: new Date(),
          },
        });
    }

    // Persist merged schedule to server
    // Delete removed schedule entries
    const mergedScheduleIds = Object.keys(mergedSchedule);
    const serverScheduleIds = serverSchedule.map((s) => s.screeningId);
    const removedScheduleIds = serverScheduleIds.filter(
      (id) => !mergedScheduleIds.includes(id)
    );

    if (removedScheduleIds.length > 0) {
      await db
        .delete(userFestivalSchedule)
        .where(
          and(
            eq(userFestivalSchedule.userId, userId),
            inArray(userFestivalSchedule.screeningId, removedScheduleIds)
          )
        );
    }

    // Upsert merged schedule
    for (const entry of Object.values(mergedSchedule)) {
      await db
        .insert(userFestivalSchedule)
        .values({
          id: entry.id,
          userId,
          screeningId: entry.screeningId,
          festivalId: entry.festivalId,
          status: entry.status,
          bookingConfirmation: entry.bookingConfirmation || null,
          notes: entry.notes || null,
        })
        .onConflictDoUpdate({
          target: [userFestivalSchedule.userId, userFestivalSchedule.screeningId],
          set: {
            status: entry.status,
            bookingConfirmation: entry.bookingConfirmation || null,
            notes: entry.notes || null,
            updatedAt: new Date(),
          },
        });
    }

    return NextResponse.json({
      success: true,
      follows: mergedFollows,
      schedule: mergedSchedule,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error, "POST /api/user/festivals/sync");
  }
}
