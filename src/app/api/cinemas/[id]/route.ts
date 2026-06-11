/**
 * Cinema Detail API Route
 * GET /api/cinemas/:id - Get cinema details and upcoming screenings
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NotFoundError, handleApiError } from "@/lib/api-errors";
import { RATE_LIMITS, withRateLimit } from "@/lib/rate-limit";
import {
  getCinemaById,
  getUpcomingScreeningsForCinema,
} from "@/db/repositories/cinema";
import { CACHE_5MIN } from "@/lib/cache-headers";

const paramsSchema = z.object({
  id: z.string().min(1).max(100),
});

export const GET = withRateLimit(RATE_LIMITS.public, "cinemas-detail")(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
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
      { headers: CACHE_5MIN }
    );
  } catch (error) {
    return handleApiError(error, "GET /api/cinemas/[id]");
  }
});
