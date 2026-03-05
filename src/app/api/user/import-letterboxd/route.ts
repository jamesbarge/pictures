import { NextResponse } from "next/server";
import { db } from "@/db";
import { films, userFilmStatuses } from "@/db/schema";
import { inArray, sql } from "drizzle-orm";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { tasks } from "@trigger.dev/sdk/v3";

const MAX_FILM_IDS = 500;

interface UnmatchedEntry {
  title: string;
  year: number | null;
  slug: string;
}

/**
 * POST /api/user/import-letterboxd — Authenticated
 *
 * Accepts an array of film IDs and batch-upserts them into the user's
 * watchlist (userFilmStatuses) with status "want_to_see".
 *
 * Optionally accepts `username` and `unmatchedEntries` to trigger a
 * background TMDB lookup for films not yet in our database.
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

  const { filmIds, username, unmatchedEntries } = body as {
    filmIds?: unknown;
    username?: unknown;
    unmatchedEntries?: unknown;
  };

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

    if (valuesToInsert.length === 0 && !hasUnmatchedEntries(username, unmatchedEntries)) {
      return NextResponse.json({ saved: 0 });
    }

    if (valuesToInsert.length > 0) {
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
    }

    // If there are unmatched entries, trigger background TMDB lookup
    let backgroundTaskTriggered = false;
    if (hasUnmatchedEntries(username, unmatchedEntries)) {
      const validEntries = (unmatchedEntries as UnmatchedEntry[]).slice(0, MAX_FILM_IDS);
      try {
        await tasks.trigger("letterboxd-import-lookup", {
          userId,
          username: username as string,
          entries: validEntries.map((e) => ({
            title: e.title,
            year: e.year,
            slug: e.slug,
          })),
        });
        backgroundTaskTriggered = true;
        console.log(
          `[import-letterboxd] Triggered background lookup for ${validEntries.length} unmatched entries`,
        );
      } catch (err) {
        // Log but don't fail the request -- background task is best-effort
        console.error("[import-letterboxd] Failed to trigger background lookup:", err);
      }
    }

    return NextResponse.json({
      saved: valuesToInsert.length,
      backgroundTaskTriggered,
    });
  } catch (error) {
    console.error("Letterboxd import error:", error);
    return NextResponse.json(
      { error: "Failed to import films" },
      { status: 500 },
    );
  }
}

/**
 * Type guard: checks that both username and unmatchedEntries are present
 * and well-formed for triggering the background TMDB lookup task.
 */
function hasUnmatchedEntries(
  username: unknown,
  unmatchedEntries: unknown,
): unmatchedEntries is UnmatchedEntry[] {
  return (
    typeof username === "string" &&
    username.length > 0 &&
    Array.isArray(unmatchedEntries) &&
    unmatchedEntries.length > 0 &&
    unmatchedEntries.every(
      (e: unknown) =>
        typeof e === "object" &&
        e !== null &&
        "title" in e &&
        typeof (e as UnmatchedEntry).title === "string" &&
        "slug" in e &&
        typeof (e as UnmatchedEntry).slug === "string",
    )
  );
}
