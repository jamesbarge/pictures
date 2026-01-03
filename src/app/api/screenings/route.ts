/**
 * Screenings API Route
 * GET /api/screenings - List screenings with filtering
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { screenings, films, cinemas, festivalScreenings, festivals } from "@/db/schema";
import { eq, gte, lte, and, inArray, sql } from "drizzle-orm";
import { startOfDay, endOfDay, addDays } from "date-fns";
import { z } from "zod";
import type { ScreeningFormat } from "@/types/screening";
import { BadRequestError, handleApiError } from "@/lib/api-errors";

// Input validation schema
const querySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  cinemas: z.string().max(500).optional(), // comma-separated UUIDs
  formats: z.string().max(200).optional(),
  repertory: z.enum(["true", "false"]).optional(),
  // Festival filtering
  festival: z.string().max(100).optional(), // festival slug
  festivalOnly: z.enum(["true", "false"]).optional(), // only show festival screenings
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Validate query parameters
    const parseResult = querySchema.safeParse({
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      cinemas: searchParams.get("cinemas") || undefined,
      formats: searchParams.get("formats") || undefined,
      repertory: searchParams.get("repertory") || undefined,
      festival: searchParams.get("festival") || undefined,
      festivalOnly: searchParams.get("festivalOnly") || undefined,
    });

    if (!parseResult.success) {
      throw new BadRequestError(
        "Invalid query parameters",
        parseResult.error.flatten()
      );
    }

    const params = parseResult.data;

    // Parse filters with validated data
    const startDate = params.startDate
      ? new Date(params.startDate)
      : startOfDay(new Date());
    const endDate = params.endDate
      ? new Date(params.endDate)
      : endOfDay(addDays(new Date(), 14)); // Default: 2 weeks ahead

    const cinemaIds = params.cinemas?.split(",").filter(Boolean);
    const formats = params.formats?.split(",").filter(Boolean);
    const isRepertory = params.repertory;
    const festivalSlug = params.festival;
    const festivalOnly = params.festivalOnly === "true";

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

    // Filter by festival only (screenings marked as festival)
    if (festivalOnly) {
      conditions.push(eq(screenings.isFestivalScreening, true));
    }

    // If filtering by specific festival, we need a different query with join
    if (festivalSlug) {
      // First, get the festival ID
      const [festival] = await db
        .select({ id: festivals.id })
        .from(festivals)
        .where(eq(festivals.slug, festivalSlug))
        .limit(1);

      if (!festival) {
        throw new BadRequestError(`Festival not found: ${festivalSlug}`);
      }

      // Query with festival join
      const results = await db
        .select({
          id: screenings.id,
          datetime: screenings.datetime,
          format: screenings.format,
          screen: screenings.screen,
          eventType: screenings.eventType,
          eventDescription: screenings.eventDescription,
          bookingUrl: screenings.bookingUrl,
          isFestivalScreening: screenings.isFestivalScreening,
          availabilityStatus: screenings.availabilityStatus,
          // Festival-specific metadata
          festivalSection: festivalScreenings.festivalSection,
          isPremiere: festivalScreenings.isPremiere,
          premiereType: festivalScreenings.premiereType,
          film: {
            id: films.id,
            title: films.title,
            year: films.year,
            directors: films.directors,
            posterUrl: films.posterUrl,
            runtime: films.runtime,
            isRepertory: films.isRepertory,
            letterboxdRating: films.letterboxdRating,
          },
          cinema: {
            id: cinemas.id,
            name: cinemas.name,
            shortName: cinemas.shortName,
          },
        })
        .from(festivalScreenings)
        .innerJoin(screenings, eq(festivalScreenings.screeningId, screenings.id))
        .innerJoin(films, eq(screenings.filmId, films.id))
        .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
        .where(and(eq(festivalScreenings.festivalId, festival.id), ...conditions))
        .orderBy(screenings.datetime)
        .limit(3000);

      return NextResponse.json(
        {
          screenings: results,
          meta: {
            total: results.length,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            festival: festivalSlug,
          },
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          },
        }
      );
    }

    // Standard query (no specific festival filter)
    const results = await db
      .select({
        id: screenings.id,
        datetime: screenings.datetime,
        format: screenings.format,
        screen: screenings.screen,
        eventType: screenings.eventType,
        eventDescription: screenings.eventDescription,
        bookingUrl: screenings.bookingUrl,
        isFestivalScreening: screenings.isFestivalScreening,
        availabilityStatus: screenings.availabilityStatus,
        film: {
          id: films.id,
          title: films.title,
          year: films.year,
          directors: films.directors,
          posterUrl: films.posterUrl,
          runtime: films.runtime,
          isRepertory: films.isRepertory,
          letterboxdRating: films.letterboxdRating,
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
    return handleApiError(error, "GET /api/screenings");
  }
}
