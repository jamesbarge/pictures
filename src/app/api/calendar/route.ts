/**
 * Calendar Export API
 * Generates iCal (.ics) files for screenings.
 * Supports both single screening export and multi-screening export.
 *
 * Usage:
 *   GET /api/calendar?screening=<id>
 *   GET /api/calendar?film=<id>  (all screenings for a film)
 *
 * Returns: text/calendar .ics file
 */

import { NextRequest } from "next/server";

import { handleApiError } from "@/lib/api-errors";
import { db } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import {
  buildIcsCalendar,
  buildIcsEvent,
  type IcalScreeningData,
} from "@/lib/ical";
import { eq, gte, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const screeningId = searchParams.get("screening");
  const filmId = searchParams.get("film");

  if (!screeningId && !filmId) {
    return Response.json(
      { error: "Provide ?screening=<id> or ?film=<id>" },
      { status: 400 }
    );
  }

  try {
    let results: IcalScreeningData[];

    if (screeningId) {
      // Single screening
      const rows = await db
        .select({
          id: screenings.id,
          datetime: screenings.datetime,
          format: screenings.format,
          screen: screenings.screen,
          eventType: screenings.eventType,
          bookingUrl: screenings.bookingUrl,
          filmTitle: films.title,
          filmYear: films.year,
          filmRuntime: films.runtime,
          cinemaName: cinemas.name,
          cinemaAddress: cinemas.address,
        })
        .from(screenings)
        .innerJoin(films, eq(screenings.filmId, films.id))
        .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
        .where(eq(screenings.id, screeningId))
        .limit(1);

      results = rows;
    } else {
      // All upcoming screenings for a film
      const now = new Date();
      const rows = await db
        .select({
          id: screenings.id,
          datetime: screenings.datetime,
          format: screenings.format,
          screen: screenings.screen,
          eventType: screenings.eventType,
          bookingUrl: screenings.bookingUrl,
          filmTitle: films.title,
          filmYear: films.year,
          filmRuntime: films.runtime,
          cinemaName: cinemas.name,
          cinemaAddress: cinemas.address,
        })
        .from(screenings)
        .innerJoin(films, eq(screenings.filmId, films.id))
        .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
        .where(
          and(eq(screenings.filmId, filmId!), gte(screenings.datetime, now))
        )
        .orderBy(screenings.datetime)
        .limit(50);

      results = rows;
    }

    if (results.length === 0) {
      return Response.json({ error: "No screenings found" }, { status: 404 });
    }

    const events = results.map(buildIcsEvent);
    const ics = buildIcsCalendar(events);

    const filename = screeningId
      ? `screening-${screeningId.slice(0, 8)}.ics`
      : `film-screenings.ics`;

    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/calendar");
  }
}
