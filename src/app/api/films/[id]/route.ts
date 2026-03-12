/**
 * Film Detail API Route
 * GET /api/films/:id - Get film metadata and upcoming screenings
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NotFoundError, handleApiError } from "@/lib/api-errors";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import { getFilmById, getUpcomingScreeningsForFilm } from "@/db/repositories/film";
import { CACHE_5MIN } from "@/lib/cache-headers";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = getClientIP(request);
    const rateLimitResult = await checkRateLimit(ip, {
      ...RATE_LIMITS.public,
      prefix: "films",
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
        { error: "Invalid film ID", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const [film, filmScreenings] = await Promise.all([
      getFilmById(id),
      getUpcomingScreeningsForFilm(id),
    ]);

    if (!film) {
      throw new NotFoundError("Film not found");
    }

    return NextResponse.json(
      {
        film,
        screenings: filmScreenings,
        meta: { screeningCount: filmScreenings.length },
      },
      { headers: CACHE_5MIN }
    );
  } catch (error) {
    return handleApiError(error, "GET /api/films/[id]");
  }
}
