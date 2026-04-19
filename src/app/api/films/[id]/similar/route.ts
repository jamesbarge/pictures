/**
 * Similar Films API Route
 * GET /api/films/:id/similar
 *
 * Proxies TMDB's /movie/{id}/similar endpoint, filters to films we actually
 * carry in our own DB (so every result is clickable and leads to a real
 * listings page), and returns up to 6. Cached for 24 h at the CDN edge —
 * similarity is effectively stable.
 *
 * Falls back to an empty array when:
 *   - the requested film has no TMDB id (we don't have a similarity signal)
 *   - TMDB returns fewer than 2 matches we carry (a rail with 1 item is noise)
 *   - TMDB is down (never 5xx the detail page for a side rail)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api-errors";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import { getFilmById, findByTmdbIds } from "@/db/repositories/film";
import { getTMDBClient } from "@/lib/tmdb/client";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const MAX_RESULTS = 6;
const MIN_RESULTS = 2;

// 24 h edge cache on the happy path — similarity doesn't change day-to-day.
const CACHE_24H = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
} as const;

// 5 min edge cache on empty/fallback responses so a transient TMDB outage
// doesn't freeze an empty rail on this film for 24 hours.
const CACHE_EMPTY = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300",
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = getClientIP(request);
    const rateLimitResult = await checkRateLimit(ip, {
      ...RATE_LIMITS.public,
      prefix: "films-similar",
    });
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests", similar: [] },
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

    const film = await getFilmById(id);
    if (!film || !film.tmdbId) {
      // No signal — return an empty list rather than a 404 so the frontend
      // can cheaply hide the rail. This is a stable condition (film has no
      // tmdbId permanently) so the 24 h cache is still fine here.
      return NextResponse.json({ similar: [] }, { headers: CACHE_24H });
    }

    let tmdbIds: number[] = [];
    try {
      const tmdb = getTMDBClient();
      const response = await tmdb.getSimilar(film.tmdbId);
      tmdbIds = response.results.map((r) => r.id);
    } catch (e) {
      console.error("TMDB similar lookup failed", e);
      return NextResponse.json({ similar: [] }, { headers: CACHE_EMPTY });
    }

    if (tmdbIds.length === 0) {
      return NextResponse.json({ similar: [] }, { headers: CACHE_EMPTY });
    }

    // Intersect with films we carry. Preserve TMDB's similarity ordering.
    const ownedFilms = await findByTmdbIds(tmdbIds);
    const byTmdbId = new Map(ownedFilms.map((f) => [f.tmdbId, f]));
    const ordered = tmdbIds
      .map((tid) => byTmdbId.get(tid))
      .filter((f): f is NonNullable<typeof f> => f !== undefined)
      .slice(0, MAX_RESULTS);

    // Don't bother showing a rail of 1 — it reads as a broken feature, not
    // a recommendation. Short-cache this too in case we later acquire a
    // related film and want the rail to pop back faster.
    if (ordered.length < MIN_RESULTS) {
      return NextResponse.json({ similar: [] }, { headers: CACHE_EMPTY });
    }

    return NextResponse.json(
      {
        similar: ordered.map((f) => ({
          id: f.id,
          title: f.title,
          year: f.year,
          posterUrl: f.posterUrl,
        })),
      },
      { headers: CACHE_24H }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
