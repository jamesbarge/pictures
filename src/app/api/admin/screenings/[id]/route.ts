/**
 * Admin Screening Detail API
 * PUT - Update an existing screening
 * DELETE - Remove a screening
 */

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import { eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface UpdateScreeningBody {
  filmId?: string;
  cinemaId?: string;
  datetime?: string;
  bookingUrl?: string;
  format?: string | null;
  screen?: string | null;
  eventType?: string | null;
  eventDescription?: string | null;
}

export async function PUT(request: Request, { params }: RouteParams) {
  // Verify admin auth
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: screeningId } = await params;

  try {
    const body: UpdateScreeningBody = await request.json();

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

    // Parse datetime if provided
    let screeningDate: Date | undefined;
    if (body.datetime) {
      screeningDate = new Date(body.datetime);
      if (isNaN(screeningDate.getTime())) {
        return Response.json({ error: "Invalid datetime format" }, { status: 400 });
      }
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.filmId) updateData.filmId = body.filmId;
    if (body.cinemaId) updateData.cinemaId = body.cinemaId;
    if (screeningDate) updateData.datetime = screeningDate;
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
    console.error("Error updating screening:", error);
    return Response.json(
      { error: "Failed to update screening" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  // Verify admin auth
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}
