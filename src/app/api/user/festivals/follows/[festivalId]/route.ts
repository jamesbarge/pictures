/**
 * Single Festival Follow API Route
 * PUT /api/user/festivals/follows/[festivalId] - Follow a festival
 * DELETE /api/user/festivals/follows/[festivalId] - Unfollow a festival
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userFestivalInterests, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAuth, unauthorizedResponse, getCurrentUserId } from "@/lib/auth";
import type { FestivalInterestLevel } from "@/db/schema/festivals";

interface RouteParams {
  params: Promise<{ festivalId: string }>;
}

/**
 * PUT - Follow a festival (or update follow preferences)
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth();
    const { festivalId } = await params;
    const body = await request.json().catch(() => ({}));

    const {
      interestLevel = "following" as FestivalInterestLevel,
      notifyOnSale = true,
      notifyProgramme = true,
      notifyReminders = true,
    } = body;

    // Ensure user exists in users table (for foreign key)
    await db
      .insert(users)
      .values({ id: userId })
      .onConflictDoNothing();

    // Upsert the follow
    await db
      .insert(userFestivalInterests)
      .values({
        userId,
        festivalId,
        interestLevel,
        notifyOnSale,
        notifyProgramme,
        notifyReminders,
      })
      .onConflictDoUpdate({
        target: [userFestivalInterests.userId, userFestivalInterests.festivalId],
        set: {
          interestLevel,
          notifyOnSale,
          notifyProgramme,
          notifyReminders,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ success: true, following: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Festival follow error:", error);
    return NextResponse.json(
      { error: "Failed to follow festival" },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Unfollow a festival
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth();
    const { festivalId } = await params;

    await db
      .delete(userFestivalInterests)
      .where(
        and(
          eq(userFestivalInterests.userId, userId),
          eq(userFestivalInterests.festivalId, festivalId)
        )
      );

    return NextResponse.json({ success: true, following: false });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Festival unfollow error:", error);
    return NextResponse.json(
      { error: "Failed to unfollow festival" },
      { status: 500 }
    );
  }
}

/**
 * GET - Check if user follows a festival
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await getCurrentUserId();
    const { festivalId } = await params;

    if (!userId) {
      return NextResponse.json({ following: false });
    }

    const follow = await db.query.userFestivalInterests.findFirst({
      where: and(
        eq(userFestivalInterests.userId, userId),
        eq(userFestivalInterests.festivalId, festivalId)
      ),
    });

    return NextResponse.json({
      following: !!follow,
      interestLevel: follow?.interestLevel || null,
      notifyOnSale: follow?.notifyOnSale ?? true,
      notifyProgramme: follow?.notifyProgramme ?? true,
      notifyReminders: follow?.notifyReminders ?? true,
    });
  } catch (error) {
    console.error("Festival follow check error:", error);
    return NextResponse.json({ following: false });
  }
}
