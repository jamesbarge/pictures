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
import { db } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import { eq, gte, and, inArray } from "drizzle-orm";

function escapeIcal(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function formatIcalDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

interface ScreeningData {
  id: string;
  datetime: Date;
  format: string | null;
  screen: string | null;
  eventType: string | null;
  bookingUrl: string;
  filmTitle: string;
  filmYear: number | null;
  filmRuntime: number | null;
  cinemaName: string;
  cinemaAddress: {
    street?: string;
    area?: string;
    postcode?: string;
  } | null;
}

function buildIcsEvent(screening: ScreeningData): string {
  const start = formatIcalDate(new Date(screening.datetime));
  const duration = screening.filmRuntime || 120; // Default 2 hours
  const end = formatIcalDate(
    new Date(new Date(screening.datetime).getTime() + duration * 60 * 1000)
  );

  const title = `${screening.filmTitle}${screening.filmYear ? ` (${screening.filmYear})` : ""}`;

  const descParts = [title, `at ${screening.cinemaName}`];
  if (screening.format && screening.format !== "unknown") {
    descParts.push(`Format: ${screening.format.toUpperCase()}`);
  }
  if (screening.eventType) {
    descParts.push(`Event: ${screening.eventType.replace(/_/g, " ")}`);
  }
  descParts.push(`Book: ${screening.bookingUrl}`);
  descParts.push("via Pictures (pictures.london)");

  const location = screening.cinemaAddress
    ? `${screening.cinemaName}, ${screening.cinemaAddress.street || ""}, ${screening.cinemaAddress.area || ""}, ${screening.cinemaAddress.postcode || ""}`
    : screening.cinemaName;

  return [
    "BEGIN:VEVENT",
    `UID:${screening.id}@pictures.london`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcal(title)} at ${escapeIcal(screening.cinemaName)}`,
    `DESCRIPTION:${escapeIcal(descParts.join("\n"))}`,
    `LOCATION:${escapeIcal(location)}`,
    `URL:${screening.bookingUrl}`,
    `STATUS:CONFIRMED`,
    "END:VEVENT",
  ].join("\r\n");
}

function buildIcsCalendar(events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pictures London//Cinema Listings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Pictures London Cinema",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

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
    let results: ScreeningData[];

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
    console.error("Calendar export error:", error);
    return Response.json(
      { error: "Failed to generate calendar" },
      { status: 500 }
    );
  }
}
