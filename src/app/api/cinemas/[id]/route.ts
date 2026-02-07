/**
 * Cinema Detail API Route
 * GET /api/cinemas/:id - Get cinema details and upcoming screenings
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NotFoundError, handleApiError } from "@/lib/api-errors";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import {
  getCinemaById,
  getUpcomingScreeningsForCinema,
} from "@/db/repositories/cinema";

const paramsSchema = z.object({
  id: z.string().min(1).max(100),
});

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = getClientIP(request);
    const rateLimitResult = checkRateLimit(ip, {
      ...RATE_LIMITS.public,
      prefix: "cinemas-detail",
    });
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimitResult.resetIn) },
        }
      );
    }

    const { id } = await params;
    const parseResult = paramsSchema.safeParse({ id });
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid cinema ID", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const [cinema, cinemaScreenings] = await Promise.all([
      getCinemaById(id),
      getUpcomingScreeningsForCinema(id),
    ]);

    if (!cinema) {
      throw new NotFoundError("Cinema not found");
    }

    return NextResponse.json(
      {
        cinema,
        screenings: cinemaScreenings,
        meta: { screeningCount: cinemaScreenings.length },
      },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    return handleApiError(error, "GET /api/cinemas/[id]");
  }
}
