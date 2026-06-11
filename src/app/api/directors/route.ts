/**
 * Directors API Route
 * GET /api/directors - List directors with upcoming film counts
 *
 * Returns directors aggregated from films with upcoming screenings,
 * sorted by film count descending. Uses a single SQL query with
 * unnest() instead of fetching all screenings and aggregating in JS.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { CACHE_5MIN } from "@/lib/cache-headers";
import { RATE_LIMITS, withRateLimit } from "@/lib/rate-limit";

export const GET = withRateLimit(RATE_LIMITS.public, "directors")(async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const days = Math.min(Number(searchParams.get("days")) || 14, 60);

  const result = await db.execute<{
    director: string;
    film_count: number;
    films: string[];
  }>(sql`
    SELECT
      d.director,
      COUNT(DISTINCT f.id)::int AS film_count,
      ARRAY_AGG(DISTINCT f.title ORDER BY f.title) AS films
    FROM films f
    JOIN screenings s ON s.film_id = f.id
    CROSS JOIN LATERAL unnest(f.directors) AS d(director)
    WHERE s.datetime >= NOW()
      AND s.datetime < NOW() + make_interval(days => ${days})
      AND f.content_type = 'film'
      AND d.director <> ''
    GROUP BY d.director
    ORDER BY film_count DESC, d.director ASC
  `);

  const directors = result.map((row) => ({
    name: row.director,
    filmCount: row.film_count,
    films: row.films,
  }));

  return NextResponse.json(
    { directors },
    { headers: CACHE_5MIN }
  );
});
