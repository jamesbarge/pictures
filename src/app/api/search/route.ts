/**
 * Search API Route
 * Searches films by title with upcoming screening counts
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { ilike, sql, count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ films: [] });
  }

  const searchTerm = `%${query.trim()}%`;
  const now = new Date();

  // Search films and count upcoming screenings
  const results = await db
    .select({
      id: films.id,
      title: films.title,
      year: films.year,
      directors: films.directors,
      posterUrl: films.posterUrl,
      screeningCount: count(screenings.id),
    })
    .from(films)
    .leftJoin(
      screenings,
      sql`${screenings.filmId} = ${films.id} AND ${screenings.datetime} >= ${now}`
    )
    .where(ilike(films.title, searchTerm))
    .groupBy(films.id)
    .orderBy(sql`COUNT(${screenings.id}) DESC`, films.title)
    .limit(10);

  return NextResponse.json(
    {
      films: results.map((r) => ({
        id: r.id,
        title: r.title,
        year: r.year,
        directors: r.directors,
        posterUrl: r.posterUrl,
        screeningCount: Number(r.screeningCount),
      })),
    },
    {
      headers: {
        // Cache for 5 minutes at edge, serve stale for 10 min while revalidating
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
