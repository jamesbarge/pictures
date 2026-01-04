/**
 * Admin Film Search API
 * Search all films (not just those with upcoming screenings)
 */

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { films } from "@/db/schema";
import { ilike, or, sql, asc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  // Verify admin auth
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim();
  const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);

  if (!query || query.length < 2) {
    return Response.json({ films: [] });
  }

  try {
    const searchPattern = `%${query}%`;

    const filmResults = await db
      .select({
        id: films.id,
        title: films.title,
        year: films.year,
        directors: films.directors,
      })
      .from(films)
      .where(
        or(
          ilike(films.title, searchPattern),
          sql`array_to_string(${films.directors}, ', ') ILIKE ${searchPattern}`
        )
      )
      .orderBy(asc(films.title))
      .limit(limit);

    return Response.json({ films: filmResults });
  } catch (error) {
    console.error("Admin film search error:", error);
    return Response.json({ error: "Search failed" }, { status: 500 });
  }
}
