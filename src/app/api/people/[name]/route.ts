/**
 * Person Detail API Route
 * GET /api/people/:name — a director/actor's upcoming films in London.
 *
 * Matches films where the person is a director (`name = ANY(directors)`) OR
 * appears in the cast jsonb (`cast @> [{"name": ...}]`), joined to upcoming
 * screenings. Powers the /people/[name] landing page and is the click target
 * for the PEOPLE group in the command palette.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { CACHE_5MIN } from "@/lib/cache-headers";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";

const paramsSchema = z.object({
  name: z.string().min(1).max(200),
});

type FilmRow = {
  id: string;
  title: string;
  year: number | null;
  directors: string[];
  posterUrl: string | null;
  runtime: number | null;
  genres: string[] | null;
  isDirector: boolean;
  isCast: boolean;
  nextScreeningAt: string | null;
  screeningCount: number;
};

function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows?: T[] }).rows ?? [];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const ip = getClientIP(request);
    const rateLimitResult = await checkRateLimit(ip, {
      ...RATE_LIMITS.public,
      prefix: "people-detail",
    });
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.resetIn) } }
      );
    }

    const { name: rawName } = await params;
    const parseResult = paramsSchema.safeParse({ name: rawName });
    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    const name = parseResult.data.name;
    // jsonb containment probe: cast array contains an element with this name.
    const castProbe = JSON.stringify([{ name }]);

    // GROUP BY f.id (primary key) lets us select the other f.* columns via
    // PostgreSQL functional-dependency without listing each in GROUP BY.
    const res = await db.execute(sql`
      SELECT
        f.id, f.title, f.year, f.directors,
        f.poster_url AS "posterUrl", f.runtime, f.genres,
        (${name} = ANY(f.directors)) AS "isDirector",
        (f.cast @> ${castProbe}::jsonb) AS "isCast",
        min(s.datetime) AS "nextScreeningAt",
        count(s.id)::int AS "screeningCount"
      FROM films f
      JOIN screenings s ON s.film_id = f.id AND s.datetime > now()
      WHERE f.content_type = 'film'
        AND (${name} = ANY(f.directors) OR f.cast @> ${castProbe}::jsonb)
      GROUP BY f.id
      ORDER BY min(s.datetime) ASC
      LIMIT 100
    `);

    const films = toRows<FilmRow>(res);
    if (films.length === 0) {
      return NextResponse.json(
        { error: "No upcoming films for this person" },
        { status: 404 }
      );
    }

    const isDirector = films.some((f) => f.isDirector);
    const isCast = films.some((f) => f.isCast);

    return NextResponse.json(
      {
        person: { name, isDirector, isCast, filmCount: films.length },
        films,
      },
      { headers: CACHE_5MIN }
    );
  } catch (error) {
    console.error("Person detail error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
