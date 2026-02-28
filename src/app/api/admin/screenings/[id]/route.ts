/**
 * Admin Screening Detail API
 * PUT - Update an existing screening
 * DELETE - Remove a screening
 */

import { withAdminAuth } from "@/lib/auth";
import { db } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { BadRequestError, handleApiError } from "@/lib/api-errors";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Zod schema for PUT - full update
const updateScreeningSchema = z.object({
  filmId: z.string().uuid().optional(),
  cinemaId: z.string().min(1).optional(),
  datetime: z.string().datetime().optional(),
  bookingUrl: z.string().url().optional(),
  format: z.string().nullable().optional(),
  screen: z.string().nullable().optional(),
  eventType: z.string().nullable().optional(),
  eventDescription: z.string().nullable().optional(),
});

// Zod schema for PATCH - lightweight inline editing
const patchScreeningSchema = z.object({
  datetime: z.string().datetime().optional(),
  format: z.string().nullable().optional(),
  screen: z.string().nullable().optional(),
  eventType: z.string().nullable().optional(),
});

export const PUT = withAdminAuth<RouteParams>(async (request, _admin, { params }) => {
  try {
    const { id: screeningId } = await params;

    // Validate request body with Zod
    const parseResult = updateScreeningSchema.safeParse(await request.json());
    if (!parseResult.success) {
      throw new BadRequestError("Invalid request body", parseResult.error.flatten());
    }
    const body = parseResult.data;

    // Verify screening exists
    const [existing] = await db
      .select({ id: screenings.id })
      .from(screenings)
      .where(eq(screenings.id, screeningId))
      .limit(1);

    if (!existing) {
      return Response.json({ error: "Screening not found" }, { status: 404 });
    }

    // Validate filmId if provided
    if (body.filmId) {
      const [film] = await db
        .select({ id: films.id })
        .from(films)
        .where(eq(films.id, body.filmId))
        .limit(1);

      if (!film) {
        return Response.json({ error: "Film not found" }, { status: 404 });
      }
    }

    // Validate cinemaId if provided
    if (body.cinemaId) {
      const [cinema] = await db
        .select({ id: cinemas.id })
        .from(cinemas)
        .where(eq(cinemas.id, body.cinemaId))
        .limit(1);

      if (!cinema) {
        return Response.json({ error: "Cinema not found" }, { status: 404 });
      }
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.filmId) updateData.filmId = body.filmId;
    if (body.cinemaId) updateData.cinemaId = body.cinemaId;
    if (body.datetime) updateData.datetime = new Date(body.datetime);
    if (body.bookingUrl !== undefined) updateData.bookingUrl = body.bookingUrl;
    if (body.format !== undefined) updateData.format = body.format;
    if (body.screen !== undefined) updateData.screen = body.screen;
    if (body.eventType !== undefined) updateData.eventType = body.eventType;
    if (body.eventDescription !== undefined) updateData.eventDescription = body.eventDescription;

    await db
      .update(screenings)
      .set(updateData)
      .where(eq(screenings.id, screeningId));

    return Response.json({
      success: true,
      message: "Screening updated",
    });
  } catch (error) {
    return handleApiError(error, "PUT /api/admin/screenings/[id]");
  }
});

/**
 * PATCH - Lightweight update for inline editing
 * Only updates the specified field(s) and marks as manually edited
 */
export const PATCH = withAdminAuth<RouteParams>(async (request, _admin, { params }) => {
  try {
    const { id: screeningId } = await params;

    // Validate request body with Zod
    const parseResult = patchScreeningSchema.safeParse(await request.json());
    if (!parseResult.success) {
      throw new BadRequestError("Invalid request body", parseResult.error.flatten());
    }
    const body = parseResult.data;

    // Verify screening exists
    const [existing] = await db
      .select({ id: screenings.id })
      .from(screenings)
      .where(eq(screenings.id, screeningId))
      .limit(1);

    if (!existing) {
      return Response.json({ error: "Screening not found" }, { status: 404 });
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // Only update fields that are explicitly provided
    if (body.datetime !== undefined) {
      updateData.datetime = new Date(body.datetime);
    }
    if (body.format !== undefined) updateData.format = body.format;
    if (body.screen !== undefined) updateData.screen = body.screen;
    if (body.eventType !== undefined) updateData.eventType = body.eventType;

    await db
      .update(screenings)
      .set(updateData)
      .where(eq(screenings.id, screeningId));

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error, "PATCH /api/admin/screenings/[id]");
  }
});

export const DELETE = withAdminAuth<RouteParams>(async (_request, _admin, { params }) => {
  const { id: screeningId } = await params;

  try {
    // Verify screening exists
    const [existing] = await db
      .select({ id: screenings.id })
      .from(screenings)
      .where(eq(screenings.id, screeningId))
      .limit(1);

    if (!existing) {
      return Response.json({ error: "Screening not found" }, { status: 404 });
    }

    await db
      .delete(screenings)
      .where(eq(screenings.id, screeningId));

    return Response.json({
      success: true,
      message: "Screening deleted",
    });
  } catch (error) {
    console.error("Error deleting screening:", error);
    return Response.json(
      { error: "Failed to delete screening" },
      { status: 500 }
    );
  }
});
