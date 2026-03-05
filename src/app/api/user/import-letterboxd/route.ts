import { NextResponse } from "next/server";
import { db } from "@/db";
import { films, userFilmStatuses } from "@/db/schema";
import { inArray, sql } from "drizzle-orm";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";

const MAX_FILM_IDS = 500;

/**
 * POST /api/user/import-letterboxd — Authenticated
 *
 * Accepts an array of film IDs and batch-upserts them into the user's
 * watchlist (userFilmStatuses) with status "want_to_see".
 *
 * Denormalized film metadata (title, year, directors, poster) is looked up
 * from the films table and stored alongside each status row.
 */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { filmIds } = body as { filmIds?: unknown };

  // Validate filmIds
  if (
    !Array.isArray(filmIds) ||
    filmIds.length === 0 ||
    filmIds.length > MAX_FILM_IDS ||
    !filmIds.every((id): id is string => typeof id === "string" && id.length > 0)
  ) {
    return NextResponse.json(
      {
        error: `filmIds must be an array of 1-${MAX_FILM_IDS} non-empty strings`,
      },
      { status: 400 },
    );
  }

  try {
    // Look up denormalized film metadata for all requested IDs
    const filmRows = await db
      .select({
        id: films.id,
        title: films.title,
        year: films.year,
        directors: films.directors,
        posterUrl: films.posterUrl,
      })
      .from(films)
      .where(inArray(films.id, filmIds));

    // Build a lookup map for O(1) access
    const filmMap = new Map(filmRows.map((f) => [f.id, f]));

    const now = new Date();

    // Build values for upsert — only include IDs that exist in our DB
    const valuesToInsert = filmIds
      .filter((id) => filmMap.has(id))
      .map((id) => {
        const film = filmMap.get(id)!;
        return {
          userId,
          filmId: id,
          status: "want_to_see" as const,
          addedAt: now,
          updatedAt: now,
          filmTitle: film.title,
          filmYear: film.year,
          filmDirectors: film.directors,
          filmPosterUrl: film.posterUrl,
        };
      });

    if (valuesToInsert.length === 0) {
      return NextResponse.json({ saved: 0 });
    }

    // Batch upsert — on conflict, update status + metadata + timestamp
    await db
      .insert(userFilmStatuses)
      .values(valuesToInsert)
      .onConflictDoUpdate({
        target: [userFilmStatuses.userId, userFilmStatuses.filmId],
        set: {
          status: sql`excluded.status`,
          updatedAt: sql`excluded.updated_at`,
          filmTitle: sql`excluded.film_title`,
          filmYear: sql`excluded.film_year`,
          filmDirectors: sql`excluded.film_directors`,
          filmPosterUrl: sql`excluded.film_poster_url`,
        },
      });

    return NextResponse.json({ saved: valuesToInsert.length });
  } catch (error) {
    console.error("Letterboxd import error:", error);
    return NextResponse.json(
      { error: "Failed to import films" },
      { status: 500 },
    );
  }
}
