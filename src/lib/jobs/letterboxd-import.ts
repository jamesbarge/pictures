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
  const { eq } = await import("drizzle-orm");
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

      // Fetch external TMDB data before opening the DB transaction.
      let newFilm: {
        title: string;
        values: (typeof films)["$inferInsert"];
      } | null = null;
      if (existing.length === 0) {
        const client = getTMDBClient();
        const fullData = await client.getFullFilmData(match.tmdbId);
        const posterUrl = fullData.details.poster_path
          ? `https://image.tmdb.org/t/p/w500${fullData.details.poster_path}`
          : null;

        newFilm = {
          title: fullData.details.title,
          values: {
            id: uuidv4(),
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
            posterUrl,
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
          },
        };
      }

      // Create-or-select the canonical film and add a new watchlist status atomically.
      const { film, created } = await db.transaction(async (tx) => {
        let created = false;
        if (newFilm) {
          const inserted = await tx
            .insert(films)
            .values(newFilm.values)
            .onConflictDoNothing({ target: films.tmdbId })
            .returning({ id: films.id });
          created = inserted.length > 0;
        }

        const [film] = await tx
          .select({
            id: films.id,
            title: films.title,
            year: films.year,
            directors: films.directors,
            posterUrl: films.posterUrl,
          })
          .from(films)
          .where(eq(films.tmdbId, match.tmdbId))
          .limit(1);

        if (!film) {
          throw new Error(`Film ${match.tmdbId} was not available after create-or-select`);
        }

        const now = new Date();
        await tx
          .insert(userFilmStatuses)
          .values({
            userId,
            filmId: film.id,
            status: "want_to_see",
            addedAt: now,
            updatedAt: now,
            filmTitle: film.title,
            filmYear: film.year,
            filmDirectors: film.directors,
            filmPosterUrl: film.posterUrl,
          })
          .onConflictDoNothing({
            target: [userFilmStatuses.userId, userFilmStatuses.filmId],
          });

        return { film, created };
      });

      if (created && newFilm) {
        console.log(
          `[letterboxd-import] Created film: ${newFilm.title} (${match.year})`,
        );
      }
      if (newFilm) {
        // Extra delay after getFullFilmData (which makes multiple TMDB calls)
        await sleep(500);
      }

      details.push({
        title: entry.title,
        year: entry.year,
        status: "matched",
        filmId: film.id,
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
