/**
 * Films search API — cmd+k palette (step 2 of 10)
 *
 * Hybrid retrieval over the search columns added in migration 0012:
 *   1. Lexical: ts_rank_cd over weighted `search_tsv`
 *   2. Trigram: word_similarity over `search_text` (typo tolerance)
 *   3. Fused via Reciprocal Rank Fusion (k=60)
 *   4. Boosted by next-upcoming-screening recency + TMDB popularity
 *
 * Fans out parallel queries for cinemas, screenings, festivals, seasons
 * so the palette can render multi-entity results in one round-trip.
 *
 * Response shape preserved for backwards compatibility with the existing
 * inline SearchInput.svelte (`{ results, cinemas }`) and extended with
 * `screenings`, `festivals`, `seasons` for the new global CommandPalette.
 *
 * Browse mode (no q) retains the alphabetical top-200 behaviour.
 */

import { addDays } from "date-fns";
import { asc, eq, gte, lte, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { films, screenings, cinemas } from "@/db/schema";
import { CACHE_5MIN, CACHE_10MIN } from "@/lib/cache-headers";
import { RATE_LIMITS, withRateLimit } from "@/lib/rate-limit";
import type { CinemaAddress } from "@/types/cinema";

const querySchema = z.object({
  q: z.string().max(100).optional(),
  browse: z.enum(["true", "false"]).optional(),
});

const FILMS_LIMIT = 12;
const CINEMAS_LIMIT = 6;
const SCREENINGS_LIMIT = 8;
const FESTIVALS_LIMIT = 5;
const SEASONS_LIMIT = 5;
const PEOPLE_LIMIT = 5;
const SCREENING_WINDOW_DAYS = 30;

function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []);
}

function formatCinemaAddress(address: CinemaAddress | null): string | null {
  if (!address) return null;
  const parts = [address.street, address.area, address.postcode].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export const GET = withRateLimit(RATE_LIMITS.search, "search")(async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const parseResult = querySchema.safeParse({
    q: searchParams.get("q") || undefined,
    browse: searchParams.get("browse") || undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", results: [], cinemas: [] },
      { status: 400 }
    );
  }

  const query = parseResult.data.q?.trim();
  const browse = parseResult.data.browse === "true";

  const startDate = new Date();
  const endDate = addDays(startDate, SCREENING_WINDOW_DAYS);

  try {
    // Browse mode: no query — return alphabetical top films + all active cinemas
    if (browse && !query) {
      const [filmResults, cinemaResults] = await Promise.all([
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
          .where(and(gte(screenings.datetime, startDate), lte(screenings.datetime, endDate)))
          .orderBy(asc(films.title))
          .limit(200),
        db
          .select({
            id: cinemas.id,
            name: cinemas.name,
            shortName: cinemas.shortName,
            address: cinemas.address,
          })
          .from(cinemas)
          .where(eq(cinemas.isActive, true))
          .orderBy(asc(cinemas.name)),
      ]);

      return NextResponse.json(
        {
          results: filmResults,
          cinemas: cinemaResults.map((c) => ({
            ...c,
            address: formatCinemaAddress(c.address),
          })),
          screenings: [],
          festivals: [],
          seasons: [],
          people: [],
        },
        { headers: CACHE_10MIN }
      );
    }

    if (!query || query.length < 2) {
      return NextResponse.json({
        results: [],
        cinemas: [],
        screenings: [],
        festivals: [],
        seasons: [],
        people: [],
      });
    }

    // RRF k=60 over tsvector + trigram, with exact-match + recency + popularity boosts.
    // Returns ALL films with ANY upcoming screening (no fixed window) so a
    // repertory title screening weeks out — or a retrospective announced early —
    // is findable; the recency boost keeps soon-showing films at the top.
    // The CTEs limit pre-fusion candidates to 200 each so the planner can
    // use the GIN indexes efficiently before the JOIN to films.
    const [filmsRes, cinemasRes, screeningsRes, festivalsRes, seasonsRes, peopleRes] =
      await Promise.all([
        db.execute(sql`
          WITH params AS (
            SELECT
              ${query}::text AS q,
              websearch_to_tsquery('pictures', ${query}) AS tsq
          ),
          lexical AS (
            SELECT f.id,
                   row_number() OVER (
                     ORDER BY ts_rank_cd(f.search_tsv, p.tsq) DESC
                   ) AS r
            FROM films f, params p
            WHERE f.search_tsv @@ p.tsq
            ORDER BY ts_rank_cd(f.search_tsv, p.tsq) DESC
            LIMIT 200
          ),
          trgm AS (
            SELECT f.id,
                   row_number() OVER (
                     ORDER BY word_similarity(p.q, f.search_text) DESC
                   ) AS r
            FROM films f, params p
            WHERE f.search_text % p.q
            ORDER BY word_similarity(p.q, f.search_text) DESC
            LIMIT 200
          ),
          fused AS (
            SELECT id,
                   sum(rrf) AS rrf_score
            FROM (
              SELECT id, 1.0/(60 + r) AS rrf FROM lexical
              UNION ALL
              SELECT id, 1.0/(60 + r) AS rrf FROM trgm
            ) u
            GROUP BY id
          )
          SELECT
            f.id,
            f.title,
            f.year,
            f.directors,
            f.poster_url AS "posterUrl",
            f.genres,
            f.tmdb_rating AS "tmdbRating",
            ns.next_dt AS "nextScreeningAt",
            (
              fused.rrf_score
              -- Exact title match dominates RRF (~0.016 max) so "amelie" → Amélie #1.
              + 0.20 * (lower(f.title) = lower(p.q))::int
              -- Prefix title match is the next-strongest signal.
              + 0.08 * (f.title ILIKE p.q || '%')::int
              -- Recency: 1-week half-life keeps soon-showing films near the top.
              + 0.05 * coalesce(exp(-extract(epoch FROM (ns.next_dt - now()))/604800.0), 0)
              + 0.02 * ln(1 + coalesce(f.tmdb_popularity, 0))
            ) AS score
          FROM fused
          JOIN films f ON f.id = fused.id
          CROSS JOIN params p
          LEFT JOIN LATERAL (
            SELECT min(s.datetime) AS next_dt
            FROM screenings s
            WHERE s.film_id = f.id AND s.datetime > now()
          ) ns ON true
          -- Only require a FUTURE screening (no upper bound): every film a user
          -- can actually still go and see is findable, not just the next 30 days.
          WHERE ns.next_dt IS NOT NULL
          ORDER BY score DESC
          LIMIT ${FILMS_LIMIT}
        `),

        db.execute(sql`
          SELECT c.id, c.name, c.short_name AS "shortName", c.address
          FROM cinemas c, websearch_to_tsquery('pictures', ${query}) tsq
          WHERE c.is_active
            AND (c.search_tsv @@ tsq OR c.search_text % ${query})
          ORDER BY
            ts_rank_cd(c.search_tsv, tsq) DESC,
            word_similarity(${query}, c.search_text) DESC
          LIMIT ${CINEMAS_LIMIT}
        `),

        db.execute(sql`
          SELECT
            s.id,
            s.datetime,
            s.format,
            s.event_type AS "eventType",
            s.booking_url AS "bookingUrl",
            s.is_sold_out AS "isSoldOut",
            f.id AS "filmId",
            f.title AS "filmTitle",
            f.poster_url AS "filmPosterUrl",
            c.id AS "cinemaId",
            c.name AS "cinemaName",
            c.short_name AS "cinemaShortName"
          FROM screenings s
          JOIN films f ON f.id = s.film_id
          JOIN cinemas c ON c.id = s.cinema_id, websearch_to_tsquery('pictures', ${query}) tsq
          WHERE s.datetime > now()
            AND s.datetime < now() + interval '${sql.raw(String(SCREENING_WINDOW_DAYS))} days'
            AND (
              f.search_tsv @@ tsq
              OR c.search_tsv @@ tsq
              OR s.search_tsv @@ tsq
              OR f.search_text % ${query}
              OR c.search_text % ${query}
            )
          ORDER BY
            (ts_rank_cd(f.search_tsv, tsq) + ts_rank_cd(c.search_tsv, tsq) + ts_rank_cd(s.search_tsv, tsq)) DESC,
            s.datetime ASC
          LIMIT ${SCREENINGS_LIMIT}
        `),

        db.execute(sql`
          SELECT id, name, slug, short_name AS "shortName",
                 year, start_date AS "startDate", end_date AS "endDate",
                 logo_url AS "logoUrl"
          FROM festivals
          WHERE is_active
            AND search_tsv @@ websearch_to_tsquery('pictures', ${query})
          ORDER BY
            ts_rank_cd(search_tsv, websearch_to_tsquery('pictures', ${query})) DESC,
            start_date ASC
          LIMIT ${FESTIVALS_LIMIT}
        `),

        db.execute(sql`
          SELECT id, name, slug, director_name AS "directorName",
                 start_date AS "startDate", end_date AS "endDate",
                 poster_url AS "posterUrl"
          FROM seasons
          WHERE is_active
            AND search_tsv @@ websearch_to_tsquery('pictures', ${query})
          ORDER BY
            ts_rank_cd(search_tsv, websearch_to_tsquery('pictures', ${query})) DESC
          LIMIT ${SEASONS_LIMIT}
        `),

        db.execute(sql`
          -- People (directors) with upcoming screenings whose name matches the query.
          -- Mirrors the /api/directors unnest pattern; ILIKE substring OR trigram for
          -- typo tolerance. Candidate set is the ~1k upcoming films, so unnest is cheap.
          SELECT d.name AS name,
                 count(DISTINCT f.id)::int AS "filmCount"
          FROM films f
          JOIN screenings s ON s.film_id = f.id
          CROSS JOIN LATERAL unnest(f.directors) AS d(name)
          WHERE s.datetime > now()
            AND f.content_type = 'film'
            AND (d.name ILIKE '%' || ${query} || '%' OR d.name % ${query})
          GROUP BY d.name
          ORDER BY
            (lower(d.name) = lower(${query}))::int DESC,
            (d.name ILIKE ${query} || '%')::int DESC,
            count(DISTINCT f.id) DESC,
            d.name ASC
          LIMIT ${PEOPLE_LIMIT}
        `),
      ]);

    type FilmRow = {
      id: string;
      title: string;
      year: number | null;
      directors: string[];
      posterUrl: string | null;
      genres: string[] | null;
      tmdbRating: number | null;
      nextScreeningAt: Date | null;
      score: number;
    };
    type CinemaRow = {
      id: string;
      name: string;
      shortName: string | null;
      address: CinemaAddress | null;
    };
    type ScreeningRow = {
      id: string;
      datetime: Date;
      format: string | null;
      eventType: string | null;
      bookingUrl: string;
      isSoldOut: boolean;
      filmId: string;
      filmTitle: string;
      filmPosterUrl: string | null;
      cinemaId: string;
      cinemaName: string;
      cinemaShortName: string | null;
    };
    type FestivalRow = {
      id: string;
      name: string;
      slug: string;
      shortName: string | null;
      year: number;
      startDate: string;
      endDate: string;
      logoUrl: string | null;
    };
    type SeasonRow = {
      id: string;
      name: string;
      slug: string;
      directorName: string | null;
      startDate: string;
      endDate: string;
      posterUrl: string | null;
    };
    type PersonRow = {
      name: string;
      filmCount: number;
    };

    const filmRows = toRows<FilmRow>(filmsRes);
    const cinemaRows = toRows<CinemaRow>(cinemasRes);
    const screeningRows = toRows<ScreeningRow>(screeningsRes);
    const festivalRows = toRows<FestivalRow>(festivalsRes);
    const seasonRows = toRows<SeasonRow>(seasonsRes);
    const peopleRows = toRows<PersonRow>(peopleRes).map((p) => ({
      name: p.name,
      filmCount: p.filmCount,
      role: "director" as const,
    }));

    return NextResponse.json(
      {
        results: filmRows,
        cinemas: cinemaRows.map((c) => ({
          ...c,
          address: formatCinemaAddress(c.address),
        })),
        screenings: screeningRows,
        festivals: festivalRows,
        seasons: seasonRows,
        people: peopleRows,
      },
      { headers: CACHE_5MIN }
    );
  } catch (error) {
    console.error("Film search error:", error);
    return NextResponse.json(
      { results: [], cinemas: [], screenings: [], festivals: [], seasons: [], people: [] },
      { status: 500 }
    );
  }
});
