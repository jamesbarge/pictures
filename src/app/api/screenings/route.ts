/**
 * Screenings API Route
 * GET /api/screenings - List screenings with filtering
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import { eq, gte, lte, and, inArray, sql } from "drizzle-orm";
import { startOfDay, endOfDay, addDays } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse filters
    const startDate = searchParams.get("startDate")
      ? new Date(searchParams.get("startDate")!)
      : startOfDay(new Date());
    const endDate = searchParams.get("endDate")
      ? new Date(searchParams.get("endDate")!)
      : endOfDay(addDays(new Date(), 14)); // Default: 2 weeks ahead

    const cinemaIds = searchParams.get("cinemas")?.split(",").filter(Boolean);
    const formats = searchParams.get("formats")?.split(",").filter(Boolean);
    const isRepertory = searchParams.get("repertory");

    // Build query conditions
    const conditions = [
      gte(screenings.datetime, startDate),
      lte(screenings.datetime, endDate),
    ];

    if (cinemaIds && cinemaIds.length > 0) {
      conditions.push(inArray(screenings.cinemaId, cinemaIds));
    }

    if (formats && formats.length > 0) {
      conditions.push(inArray(screenings.format, formats as any));
    }

    // Fetch screenings with film and cinema data
    const results = await db
      .select({
        id: screenings.id,
        datetime: screenings.datetime,
        format: screenings.format,
        screen: screenings.screen,
        eventType: screenings.eventType,
        eventDescription: screenings.eventDescription,
        bookingUrl: screenings.bookingUrl,
        film: {
          id: films.id,
          title: films.title,
          year: films.year,
          directors: films.directors,
          posterUrl: films.posterUrl,
          runtime: films.runtime,
          isRepertory: films.isRepertory,
        },
        cinema: {
          id: cinemas.id,
          name: cinemas.name,
          shortName: cinemas.shortName,
        },
      })
      .from(screenings)
      .innerJoin(films, eq(screenings.filmId, films.id))
      .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
      .where(and(...conditions))
      .orderBy(screenings.datetime);

    // Filter by repertory if requested
    let filtered = results;
    if (isRepertory === "true") {
      filtered = results.filter((s) => s.film.isRepertory);
    } else if (isRepertory === "false") {
      filtered = results.filter((s) => !s.film.isRepertory);
    }

    return NextResponse.json({
      screenings: filtered,
      meta: {
        total: filtered.length,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching screenings:", error);
    return NextResponse.json(
      { error: "Failed to fetch screenings" },
      { status: 500 }
    );
  }
}
