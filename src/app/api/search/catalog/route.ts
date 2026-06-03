/**
 * Search Catalog API Route
 * GET /api/search/catalog
 *
 * Returns a lean snapshot of the searchable entities so the frontend can build
 * an in-browser fuzzy index (MiniSearch) and serve INSTANT, typo-tolerant
 * suggestions with zero per-keystroke server round-trips.
 *
 * Scope (decided): films + cinemas + people (directors) — all internal-linking.
 * Only films with a FUTURE screening are included (mirrors the live search's
 * `screenings.datetime > now()` filter) so every result is actionable. People
 * are the directors of those films.
 *
 * Slow-changing data (only moves when scrapes add/remove screenings) → cached
 * hard at the edge (1h) with a long stale-while-revalidate (24h).
 */

import { NextRequest, NextResponse } from "next/server";
import { asc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { getActiveCinemas } from "@/db/repositories/cinema";
import { CACHE_1HOUR } from "@/lib/cache-headers";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import type { CinemaAddress } from "@/types/cinema";

export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const rateLimitResult = await checkRateLimit(ip, {
    ...RATE_LIMITS.public,
    prefix: "search-catalog",
  });
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many requests", films: [], cinemas: [], people: [] },
      { status: 429, headers: { "Retry-After": String(rateLimitResult.resetIn) } }
    );
  }

  try {
    const now = new Date();

    const [filmRows, cinemaList, peopleRows] = await Promise.all([
      // Films with any future screening (no upper bound — mirrors the live
      // search). selectDistinct dedupes a film across its many screenings.
      // NB: no content_type filter here (matches the live search's film
      // results, which include events/live-broadcasts). The people query below
      // intentionally restricts to content_type='film' so only real directors
      // surface — same asymmetry as /api/films/search.
      db
        .selectDistinct({
          id: films.id,
          title: films.title,
          year: films.year,
          directors: films.directors,
          posterUrl: films.posterUrl,
        })
        .from(films)
        .innerJoin(screenings, eq(films.id, screenings.filmId))
        .where(gte(screenings.datetime, now))
        .orderBy(asc(films.title)),

      // Active cinemas (reuses the same repository the /api/cinemas route uses).
      getActiveCinemas(),

      // Directors of films with a future screening — mirrors /api/directors'
      // unnest pattern, but with no day cap (the full upcoming horizon).
      db.execute<{ director: string; film_count: number }>(sql`
        SELECT
          d.director,
          COUNT(DISTINCT f.id)::int AS film_count
        FROM films f
        JOIN screenings s ON s.film_id = f.id
        CROSS JOIN LATERAL unnest(f.directors) AS d(director)
        WHERE s.datetime >= NOW()
          AND f.content_type = 'film'
          AND d.director <> ''
        GROUP BY d.director
        ORDER BY film_count DESC, d.director ASC
      `),
    ]);

    const filmsOut = filmRows.map((f) => ({
      id: f.id,
      title: f.title,
      year: f.year,
      directors: f.directors,
      posterUrl: f.posterUrl,
    }));

    const cinemasOut = cinemaList.map((c) => ({
      id: c.id,
      name: c.name,
      shortName: c.shortName,
      area: (c.address as CinemaAddress | null)?.area ?? null,
    }));

    const peopleOut = peopleRows.map((p) => ({
      name: p.director,
      role: "director" as const,
      filmCount: p.film_count,
    }));

    return NextResponse.json(
      {
        films: filmsOut,
        cinemas: cinemasOut,
        people: peopleOut,
        generatedAt: now.toISOString(),
      },
      { headers: CACHE_1HOUR }
    );
  } catch (error) {
    console.error("Search catalog error:", error);
    return NextResponse.json(
      { error: "Failed to build catalog", films: [], cinemas: [], people: [] },
      { status: 500 }
    );
  }
}
