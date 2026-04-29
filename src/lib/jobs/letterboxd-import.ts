/**
 * Letterboxd Import — pure-Node job module.
 *
 * Extracted out of src/trigger/enrichment/letterboxd-import.ts so the same
 * logic runs locally (CLI, admin API) without any the cloud orchestrator dependency.
 * The trigger wrapper is now a thin shim that calls runLetterboxdImport().
 *
 * Processes unmatched Letterboxd watchlist entries by looking them up via TMDB,
 * creating film records, and upserting them into the user's watchlist.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LetterboxdImportPayload {
  userId: string;
  username: string;
  entries: Array<{ title: string; year: number | null; slug: string }>;
}

export interface LetterboxdImportOutput {
  matched: number;
  failed: number;
  skipped: number;
  total: number;
  details: Array<{
    title: string;
    year: number | null;
    status: "matched" | "not_found" | "error";
    filmId?: string;
    tmdbId?: number;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

/**
 * Pure-Node Letterboxd watchlist import. Callable from any context.
 */
export async function runLetterboxdImport(
  payload: LetterboxdImportPayload,
): Promise<LetterboxdImportOutput> {
  // Dynamic imports to avoid bundling issues (following existing the cloud orchestrator patterns)
  const { matchFilmToTMDB, getTMDBClient, isRepertoryFilm, getDecade } =
    await import("@/lib/tmdb");
  const { db } = await import("@/db");
  const { films, userFilmStatuses } = await import("@/db/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { v4: uuidv4 } = await import("uuid");

  const { userId, username, entries } = payload;

  console.log(
    `[letterboxd-import] Starting lookup for ${entries.length} unmatched entries ` +
      `(user: ${username}, userId: ${userId})`,
  );

  const details: LetterboxdImportOutput["details"] = [];
  let matched = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    try {
      // Step 1: Try TMDB match (skipAmbiguityCheck since we have Letterboxd-quality metadata)
      const match = await matchFilmToTMDB(entry.title, {
        year: entry.year ?? undefined,
        skipAmbiguityCheck: true,
      });

      if (!match) {
        details.push({
          title: entry.title,
          year: entry.year,
          status: "not_found",
        });
        skipped++;
        continue;
      }

      // Step 2: Check if film with this tmdbId already exists
      const existing = await db
        .select({ id: films.id })
        .from(films)
        .where(eq(films.tmdbId, match.tmdbId))
        .limit(1);

      let filmId: string;
      let filmTitle: string = match.title;
      let filmYear: number | null = match.year || null;
      let filmDirectors: string[] = [];
      let filmPosterUrl: string | null = match.posterPath
        ? `https://image.tmdb.org/t/p/w500${match.posterPath}`
        : null;

      if (existing.length > 0) {
        // Film already exists -- use it
        filmId = existing[0].id;

        // Fetch the existing film's metadata for the denormalized status row
        const filmRow = await db
          .select({
            title: films.title,
            year: films.year,
            directors: films.directors,
            posterUrl: films.posterUrl,
          })
          .from(films)
          .where(eq(films.id, filmId))
          .limit(1);

        if (filmRow.length > 0) {
          filmTitle = filmRow[0].title;
          filmYear = filmRow[0].year;
          filmDirectors = filmRow[0].directors;
          filmPosterUrl = filmRow[0].posterUrl;
        }
      } else {
        // Step 3: Create a new film record from TMDB data
        const client = getTMDBClient();
        const fullData = await client.getFullFilmData(match.tmdbId);

        filmId = uuidv4();
        filmTitle = fullData.details.title;
        filmYear = match.year || null;
        filmDirectors = fullData.directors;
        filmPosterUrl = fullData.details.poster_path
          ? `https://image.tmdb.org/t/p/w500${fullData.details.poster_path}`
          : null;

        await db.insert(films).values({
          id: filmId,
          tmdbId: match.tmdbId,
          imdbId: fullData.details.imdb_id,
          title: fullData.details.title,
          originalTitle: fullData.details.original_title,
          year: match.year || null,
          runtime: fullData.details.runtime,
          directors: fullData.directors,
          cast: fullData.cast,
          genres: fullData.details.genres.map((g) => g.name.toLowerCase()),
          countries: fullData.details.production_countries.map((c) => c.iso_3166_1),
          languages: fullData.details.spoken_languages.map((l) => l.iso_639_1),
          certification: fullData.certification,
          synopsis: fullData.details.overview,
          tagline: fullData.details.tagline,
          posterUrl: filmPosterUrl,
          backdropUrl: fullData.details.backdrop_path
            ? `https://image.tmdb.org/t/p/w1280${fullData.details.backdrop_path}`
            : null,
          isRepertory: isRepertoryFilm(fullData.details.release_date),
          decade: match.year ? getDecade(match.year) : null,
          tmdbRating: fullData.details.vote_average,
          tmdbPopularity: fullData.details.popularity,
          matchConfidence: match.confidence,
          matchStrategy: entry.year ? "auto-with-year" : "auto-no-hints",
          matchedAt: new Date(),
        });

        console.log(
          `[letterboxd-import] Created film: ${fullData.details.title} (${match.year})`,
        );

        // Extra delay after getFullFilmData (which makes multiple TMDB calls)
        await sleep(500);
      }

      // Step 4: Upsert into userFilmStatuses as "want_to_see"
      const now = new Date();
      await db
        .insert(userFilmStatuses)
        .values({
          userId,
          filmId,
          status: "want_to_see",
          addedAt: now,
          updatedAt: now,
          filmTitle,
          filmYear,
          filmDirectors,
          filmPosterUrl,
        })
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

      details.push({
        title: entry.title,
        year: entry.year,
        status: "matched",
        filmId,
        tmdbId: match.tmdbId,
      });
      matched++;
    } catch (error) {
      console.error(
        `[letterboxd-import] Error processing "${entry.title}":`,
        error,
      );
      details.push({
        title: entry.title,
        year: entry.year,
        status: "error",
      });
      failed++;
    }

    // Rate limit: ~4 req/sec (250ms between calls)
    if (i < entries.length - 1) {
      await sleep(250);
    }
  }

  console.log(
    `[letterboxd-import] Complete: ${matched} matched, ${skipped} not found, ` +
      `${failed} errors (${entries.length} total)`,
  );

  return { matched, failed, skipped, total: entries.length, details };
}
