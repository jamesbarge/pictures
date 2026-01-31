/**
 * Screenings API Route
 * GET /api/screenings - List screenings with filtering
 */

import { NextRequest, NextResponse } from "next/server";
import { endOfDay, addDays } from "date-fns";
import { z } from "zod";
import type { ScreeningFormat } from "@/types/screening";
import { BadRequestError, handleApiError } from "@/lib/api-errors";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import {
  getScreenings,
  getScreeningsByFestival,
  getScreeningsBySeason,
  type ScreeningFilters,
} from "@/db/repositories";

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
  // Season filtering
  season: z.string().max(100).optional(), // season slug (director retrospectives)
});

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

export async function GET(request: NextRequest) {
  try {
    // Rate limit check
    const ip = getClientIP(request);
    const rateLimitResult = checkRateLimit(ip, { ...RATE_LIMITS.public, prefix: "screenings" });
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests", screenings: [] },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimitResult.resetIn) },
        }
      );
    }

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
      season: searchParams.get("season") || undefined,
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
      : new Date();
    const endDate = params.endDate
      ? new Date(params.endDate)
      : endOfDay(addDays(new Date(), 14)); // Default: 2 weeks ahead

    const filters: ScreeningFilters = {
      startDate,
      endDate,
      cinemaIds: params.cinemas?.split(",").filter(Boolean),
      formats: params.formats?.split(",").filter(Boolean) as ScreeningFormat[] | undefined,
      isRepertory: params.repertory === "true" ? true : params.repertory === "false" ? false : undefined,
      festivalOnly: params.festivalOnly === "true",
    };

    // Festival-specific query
    if (params.festival) {
      const { festival, screenings } = await getScreeningsByFestival(
        params.festival,
        filters
      );

      if (!festival) {
        throw new BadRequestError(`Festival not found: ${params.festival}`);
      }

      return NextResponse.json(
        {
          screenings,
          meta: {
            total: screenings.length,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            festival: params.festival,
          },
        },
        { headers: CACHE_HEADERS }
      );
    }

    // Season-specific query
    if (params.season) {
      const { season, screenings } = await getScreeningsBySeason(
        params.season,
        filters
      );

      if (!season) {
        throw new BadRequestError(`Season not found: ${params.season}`);
      }

      return NextResponse.json(
        {
          screenings,
          meta: {
            total: screenings.length,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            season: params.season,
            seasonName: season.name,
          },
        },
        { headers: CACHE_HEADERS }
      );
    }

    // Standard query
    const results = await getScreenings(filters);

    return NextResponse.json(
      {
        screenings: results,
        meta: {
          total: results.length,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    return handleApiError(error, "GET /api/screenings");
  }
}
