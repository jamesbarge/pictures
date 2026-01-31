import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { films, screenings, cinemas } from "@/db/schema";
import { ilike, or, sql, asc, gte, lte, eq, and } from "drizzle-orm";
import { addDays } from "date-fns";
import { z } from "zod";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import type { CinemaAddress } from "@/types/cinema";

// Input validation schema
const querySchema = z.object({
  q: z.string().max(100).optional(),
  browse: z.enum(["true", "false"]).optional(),
});

export async function GET(request: NextRequest) {
  // Rate limit check
  const ip = getClientIP(request);
  const rateLimitResult = checkRateLimit(ip, { ...RATE_LIMITS.search, prefix: "search" });
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many requests", results: [] },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimitResult.resetIn) },
      }
    );
  }

  const searchParams = request.nextUrl.searchParams;

  // Validate query parameters
  const parseResult = querySchema.safeParse({
    q: searchParams.get("q") || undefined,
    browse: searchParams.get("browse") || undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", results: [] },
      { status: 400 }
    );
  }

  const query = parseResult.data.q?.trim();
  const browse = parseResult.data.browse === "true";

  // Only show films with screenings in the next 30 days
  const startDate = new Date();
  const endDate = addDays(startDate, 30);

  const formatCinemaAddress = (address: CinemaAddress | null) => {
    if (!address) return null;
    const parts = [address.street, address.area, address.postcode].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  };

  try {
    // Browse mode: return films with upcoming screenings, alphabetically
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
          .where(
            and(
              gte(screenings.datetime, startDate),
              lte(screenings.datetime, endDate)
            )
          )
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

      const formattedCinemas = cinemaResults.map((cinema) => ({
        ...cinema,
        address: formatCinemaAddress(cinema.address),
      }));

      return NextResponse.json(
        { results: filmResults, cinemas: formattedCinemas },
        {
          headers: {
            // Cache browse results for 10 minutes (very stable data)
            "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200",
          },
        }
      );
    }

    // Search mode: filter by query, only films with upcoming screenings
    if (!query || query.length < 2) {
      return NextResponse.json({ results: [], cinemas: [] });
    }

    const searchPattern = `%${query}%`;

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
        .where(
          and(
            gte(screenings.datetime, startDate),
            lte(screenings.datetime, endDate),
            or(
              ilike(films.title, searchPattern),
              sql`array_to_string(${films.directors}, ', ') ILIKE ${searchPattern}`
            )
          )
        )
        .orderBy(asc(films.title))
        .limit(50),
      db
        .select({
          id: cinemas.id,
          name: cinemas.name,
          shortName: cinemas.shortName,
          address: cinemas.address,
        })
        .from(cinemas)
        .where(
          and(
            eq(cinemas.isActive, true),
            or(
              ilike(cinemas.name, searchPattern),
              ilike(cinemas.shortName, searchPattern)
            )
          )
        )
        .orderBy(asc(cinemas.name))
        .limit(10),
    ]);

    const formattedCinemas = cinemaResults.map((cinema) => ({
      ...cinema,
      address: formatCinemaAddress(cinema.address),
    }));

    return NextResponse.json(
      { results: filmResults, cinemas: formattedCinemas },
      {
        headers: {
          // Cache search results for 5 minutes
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("Film search error:", error);
    return NextResponse.json({ results: [], cinemas: [] }, { status: 500 });
  }
}
