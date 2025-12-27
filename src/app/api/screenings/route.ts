/**
 * Screenings API Route
 * GET /api/screenings - List screenings with filtering
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import { eq, gte, lte, and, inArray } from "drizzle-orm";
import { startOfDay, endOfDay, addDays } from "date-fns";
import type { ScreeningFormat } from "@/types/screening";

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
      conditions.push(inArray(screenings.format, formats as ScreeningFormat[]));
    }

    // Filter by repertory in SQL (much faster than JS filtering)
    if (isRepertory === "true") {
      conditions.push(eq(films.isRepertory, true));
    } else if (isRepertory === "false") {
      conditions.push(eq(films.isRepertory, false));
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
      .orderBy(screenings.datetime)
      .limit(3000); // Per-week fetch (holiday periods can have 300+/day)

    return NextResponse.json(
      {
        screenings: results,
        meta: {
          total: results.length,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
      {
        headers: {
          // Cache for 5 minutes at edge, serve stale for 10 min while revalidating
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching screenings:", error);
    return NextResponse.json(
      { error: "Failed to fetch screenings" },
      { status: 500 }
    );
  }
}
