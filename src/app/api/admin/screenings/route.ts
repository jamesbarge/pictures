/**
 * Admin Screenings API
 * POST - Create a new screening manually
 */

import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { ScreeningFormat, EventType } from "@/types/screening";

interface CreateScreeningBody {
  filmId: string;
  cinemaId: string;
  datetime: string;
  bookingUrl: string;
  format?: string | null;
  screen?: string | null;
  eventType?: string | null;
  eventDescription?: string | null;
}

export async function POST(request: Request) {
  // Verify admin auth
  const admin = await requireAdmin();
  if (admin instanceof Response) {
    return admin;
  }

  try {
    const body: CreateScreeningBody = await request.json();
    const { filmId, cinemaId, datetime, bookingUrl, format, screen, eventType, eventDescription } = body;

    // Validation
    if (!filmId || !cinemaId || !datetime || !bookingUrl) {
      return Response.json(
        { error: "Missing required fields: filmId, cinemaId, datetime, bookingUrl" },
        { status: 400 }
      );
    }

    // Validate film exists
    const [film] = await db
      .select({ id: films.id })
      .from(films)
      .where(eq(films.id, filmId))
      .limit(1);

    if (!film) {
      return Response.json({ error: "Film not found" }, { status: 404 });
    }

    // Validate cinema exists
    const [cinema] = await db
      .select({ id: cinemas.id })
      .from(cinemas)
      .where(eq(cinemas.id, cinemaId))
      .limit(1);

    if (!cinema) {
      return Response.json({ error: "Cinema not found" }, { status: 404 });
    }

    // Parse datetime
    const screeningDate = new Date(datetime);
    if (isNaN(screeningDate.getTime())) {
      return Response.json({ error: "Invalid datetime format" }, { status: 400 });
    }

    // Create the screening
    const screeningId = nanoid();
    await db.insert(screenings).values({
      id: screeningId,
      filmId,
      cinemaId,
      datetime: screeningDate,
      bookingUrl,
      format: (format || null) as ScreeningFormat | null,
      screen: screen || null,
      eventType: (eventType || null) as EventType | null,
      eventDescription: eventDescription || null,
      sourceId: "manual", // Mark as manually created
      scrapedAt: new Date(),
      updatedAt: new Date(),
    });

    return Response.json({
      success: true,
      id: screeningId,
      message: "Screening created",
    });
  } catch (error) {
    console.error("Error creating screening:", error);
    return Response.json(
      { error: "Failed to create screening" },
      { status: 500 }
    );
  }
}
