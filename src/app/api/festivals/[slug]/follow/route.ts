/**
 * Festival Follow API Route
 * POST /api/festivals/[slug]/follow - Follow a festival
 * DELETE /api/festivals/[slug]/follow - Unfollow a festival
 * PATCH /api/festivals/[slug]/follow - Update notification preferences
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { festivals, userFestivalInterests } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  handleApiError,
} from "@/lib/api-errors";
import { requireAuth } from "@/lib/auth";

// Schema for POST/PATCH body
const followSchema = z.object({
  interestLevel: z
    .enum(["following", "highly_interested", "attending"])
    .optional()
    .default("following"),
  notifyOnSale: z.boolean().optional().default(true),
  notifyProgramme: z.boolean().optional().default(true),
  notifyReminders: z.boolean().optional().default(true),
});

/**
 * POST - Follow a festival
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const userId = await requireAuth();
    const { slug } = await params;

    // Parse and validate body
    const body = await request.json().catch(() => ({}));
    const parseResult = followSchema.safeParse(body);

    if (!parseResult.success) {
      throw new BadRequestError(
        "Invalid request body",
        parseResult.error.flatten()
      );
    }

    const { interestLevel, notifyOnSale, notifyProgramme, notifyReminders } =
      parseResult.data;

    // Find the festival
    const [festival] = await db
      .select({ id: festivals.id, name: festivals.name })
      .from(festivals)
      .where(eq(festivals.slug, slug))
      .limit(1);

    if (!festival) {
      throw new NotFoundError(`Festival not found: ${slug}`);
    }

    // Check if already following
    const [existing] = await db
      .select()
      .from(userFestivalInterests)
      .where(
        and(
          eq(userFestivalInterests.userId, userId),
          eq(userFestivalInterests.festivalId, festival.id)
        )
      )
      .limit(1);

    if (existing) {
      // Update existing follow
      await db
        .update(userFestivalInterests)
        .set({
          interestLevel,
          notifyOnSale,
          notifyProgramme,
          notifyReminders,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userFestivalInterests.userId, userId),
            eq(userFestivalInterests.festivalId, festival.id)
          )
        );

      return NextResponse.json({
        success: true,
        message: `Updated follow preferences for ${festival.name}`,
        follow: {
          festivalId: festival.id,
          interestLevel,
          notifyOnSale,
          notifyProgramme,
          notifyReminders,
        },
      });
    }

    // Create new follow
    await db.insert(userFestivalInterests).values({
      userId,
      festivalId: festival.id,
      interestLevel,
      notifyOnSale,
      notifyProgramme,
      notifyReminders,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Now following ${festival.name}`,
        follow: {
          festivalId: festival.id,
          interestLevel,
          notifyOnSale,
          notifyProgramme,
          notifyReminders,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "POST /api/festivals/[slug]/follow");
  }
}

/**
 * DELETE - Unfollow a festival
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const userId = await requireAuth();
    const { slug } = await params;

    // Find the festival
    const [festival] = await db
      .select({ id: festivals.id, name: festivals.name })
      .from(festivals)
      .where(eq(festivals.slug, slug))
      .limit(1);

    if (!festival) {
      throw new NotFoundError(`Festival not found: ${slug}`);
    }

    // Delete the follow
    const result = await db
      .delete(userFestivalInterests)
      .where(
        and(
          eq(userFestivalInterests.userId, userId),
          eq(userFestivalInterests.festivalId, festival.id)
        )
      )
      .returning({ festivalId: userFestivalInterests.festivalId });

    if (result.length === 0) {
      return NextResponse.json({
        success: true,
        message: `Not following ${festival.name}`,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Unfollowed ${festival.name}`,
    });
  } catch (error) {
    return handleApiError(error, "DELETE /api/festivals/[slug]/follow");
  }
}

/**
 * PATCH - Update notification preferences for a followed festival
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const userId = await requireAuth();
    const { slug } = await params;

    // Parse and validate body (partial update)
    const body = await request.json().catch(() => ({}));
    const updateSchema = z.object({
      interestLevel: z.enum(["following", "highly_interested", "attending"]).optional(),
      notifyOnSale: z.boolean().optional(),
      notifyProgramme: z.boolean().optional(),
      notifyReminders: z.boolean().optional(),
    });

    const parseResult = updateSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestError(
        "Invalid request body",
        parseResult.error.flatten()
      );
    }

    const updates = parseResult.data;

    // Find the festival
    const [festival] = await db
      .select({ id: festivals.id, name: festivals.name })
      .from(festivals)
      .where(eq(festivals.slug, slug))
      .limit(1);

    if (!festival) {
      throw new NotFoundError(`Festival not found: ${slug}`);
    }

    // Update the follow record
    const result = await db
      .update(userFestivalInterests)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userFestivalInterests.userId, userId),
          eq(userFestivalInterests.festivalId, festival.id)
        )
      )
      .returning();

    if (result.length === 0) {
      throw new NotFoundError(`Not following ${festival.name}`);
    }

    return NextResponse.json({
      success: true,
      message: `Updated preferences for ${festival.name}`,
      follow: {
        festivalId: festival.id,
        interestLevel: result[0].interestLevel,
        notifyOnSale: result[0].notifyOnSale,
        notifyProgramme: result[0].notifyProgramme,
        notifyReminders: result[0].notifyReminders,
      },
    });
  } catch (error) {
    return handleApiError(error, "PATCH /api/festivals/[slug]/follow");
  }
}
