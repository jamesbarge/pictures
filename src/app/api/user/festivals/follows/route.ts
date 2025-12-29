/**
 * Festival Follows API Route
 * POST /api/user/festivals/follows - Push festival follows to server
 * GET /api/user/festivals/follows - Get user's festival follows
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userFestivalInterests, festivals } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { BadRequestError, handleApiError } from "@/lib/api-errors";
import { requireAuth, getCurrentUserId } from "@/lib/auth";

// Schema for incoming follows
const followsSchema = z.object({
  follows: z.array(
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
  ),
});

/**
 * GET - Get user's festival follows
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ follows: [] });
    }

    const follows = await db
      .select({
        festivalId: userFestivalInterests.festivalId,
        interestLevel: userFestivalInterests.interestLevel,
        notifyOnSale: userFestivalInterests.notifyOnSale,
        notifyProgramme: userFestivalInterests.notifyProgramme,
        notifyReminders: userFestivalInterests.notifyReminders,
        followedAt: userFestivalInterests.createdAt,
        updatedAt: userFestivalInterests.updatedAt,
        festivalName: festivals.name,
        festivalSlug: festivals.slug,
      })
      .from(userFestivalInterests)
      .innerJoin(festivals, eq(userFestivalInterests.festivalId, festivals.id))
      .where(eq(userFestivalInterests.userId, userId));

    // Transform to client format
    const result: Record<
      string,
      {
        festivalId: string;
        festivalName: string;
        festivalSlug: string;
        interestLevel: string;
        notifyOnSale: boolean;
        notifyProgramme: boolean;
        notifyReminders: boolean;
        followedAt: string;
        updatedAt: string;
      }
    > = {};

    for (const follow of follows) {
      result[follow.festivalId] = {
        festivalId: follow.festivalId,
        festivalName: follow.festivalName,
        festivalSlug: follow.festivalSlug,
        interestLevel: follow.interestLevel,
        notifyOnSale: follow.notifyOnSale,
        notifyProgramme: follow.notifyProgramme,
        notifyReminders: follow.notifyReminders,
        followedAt: follow.followedAt?.toISOString() || new Date().toISOString(),
        updatedAt: follow.updatedAt?.toISOString() || new Date().toISOString(),
      };
    }

    return NextResponse.json({ follows: result });
  } catch (error) {
    return handleApiError(error, "GET /api/user/festivals/follows");
  }
}

/**
 * POST - Push festival follows to server
 * This is a full replace - client state becomes server state
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();

    // Parse and validate body
    const body = await request.json().catch(() => ({}));
    const parseResult = followsSchema.safeParse(body);

    if (!parseResult.success) {
      throw new BadRequestError("Invalid follows data", parseResult.error.flatten());
    }

    const { follows } = parseResult.data;

    // Get current server follows
    const serverFollows = await db
      .select({ festivalId: userFestivalInterests.festivalId })
      .from(userFestivalInterests)
      .where(eq(userFestivalInterests.userId, userId));

    const serverFollowIds = serverFollows.map((f) => f.festivalId);
    const clientFollowIds = follows.map((f) => f.festivalId);

    // Delete follows that are no longer in client state
    const toDelete = serverFollowIds.filter((id) => !clientFollowIds.includes(id));
    if (toDelete.length > 0) {
      await db
        .delete(userFestivalInterests)
        .where(
          and(
            eq(userFestivalInterests.userId, userId),
            inArray(userFestivalInterests.festivalId, toDelete)
          )
        );
    }

    // Upsert all client follows
    for (const follow of follows) {
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

    return NextResponse.json({
      success: true,
      count: follows.length,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/user/festivals/follows");
  }
}
