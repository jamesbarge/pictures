/**
 * Cinema List API Route
 * GET /api/cinemas - List all active cinemas
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api-errors";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import { getActiveCinemas } from "@/db/repositories/cinema";
import { CACHE_10MIN } from "@/lib/cache-headers";

const querySchema = z.object({
  chain: z.string().max(100).optional(),
  features: z.string().max(300).optional(), // comma-separated
});

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const rateLimitResult = await checkRateLimit(ip, {
      ...RATE_LIMITS.public,
      prefix: "cinemas",
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

    const searchParams = request.nextUrl.searchParams;
    const parseResult = querySchema.safeParse({
      chain: searchParams.get("chain") || undefined,
      features: searchParams.get("features") || undefined,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const params = parseResult.data;
    const filters = {
      chain: params.chain,
      features: params.features?.split(",").filter(Boolean),
    };

    const cinemaList = await getActiveCinemas(filters);

    return NextResponse.json(
      {
        cinemas: cinemaList,
        meta: { total: cinemaList.length },
      },
      { headers: CACHE_10MIN }
    );
  } catch (error) {
    return handleApiError(error, "GET /api/cinemas");
  }
}
