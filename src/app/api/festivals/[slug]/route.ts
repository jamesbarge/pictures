/**
 * Festival Detail API Route
 * GET /api/festivals/[slug] - Get festival details with upcoming screenings
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { festivals, festivalScreenings, screenings, films, cinemas } from "@/db/schema";
import { eq, and, asc, gte } from "drizzle-orm";
import { NotFoundError, handleApiError } from "@/lib/api-errors";
import { CACHE_2MIN } from "@/lib/cache-headers";

/** Derive the festival lifecycle status from its date range. */
function computeFestivalStatus(
  startDate: Date | string,
  endDate: Date | string,
  now: Date,
): "upcoming" | "ongoing" | "past" {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (now < start) return "upcoming";
  if (now > end) return "past";
  return "ongoing";
}

/** Derive the ticket sale status from the festival's sale dates. */
function computeTicketStatus(
  festival: { publicSaleDate: string | Date | null; memberSaleDate: string | Date | null },
  now: Date,
): "not_announced" | "member_sale" | "on_sale" | null {
  if (!festival.publicSaleDate) return null;
  const publicSale = new Date(festival.publicSaleDate);
  const memberSale = festival.memberSaleDate ? new Date(festival.memberSaleDate) : null;
  if (now >= publicSale) return "on_sale";
  if (memberSale && now >= memberSale) return "member_sale";
  return "not_announced";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Fetch the festival
    const [festival] = await db
      .select()
      .from(festivals)
      .where(eq(festivals.slug, slug))
      .limit(1);

    if (!festival) {
      throw new NotFoundError(`Festival not found: ${slug}`);
    }

    const now = new Date();

    const screeningResults = await db
      .select({
        id: screenings.id,
        datetime: screenings.datetime,
        format: screenings.format,
        screen: screenings.screen,
        eventType: screenings.eventType,
        eventDescription: screenings.eventDescription,
        bookingUrl: screenings.bookingUrl,
        availabilityStatus: screenings.availabilityStatus,
        // Festival-specific metadata
        festivalSection: festivalScreenings.festivalSection,
        isPremiere: festivalScreenings.isPremiere,
        premiereType: festivalScreenings.premiereType,
        // Film data
        film: {
          id: films.id,
          title: films.title,
          year: films.year,
          directors: films.directors,
          posterUrl: films.posterUrl,
          runtime: films.runtime,
        },
        // Cinema data
        cinema: {
          id: cinemas.id,
          name: cinemas.name,
          shortName: cinemas.shortName,
        },
      })
      .from(festivalScreenings)
      .innerJoin(screenings, eq(festivalScreenings.screeningId, screenings.id))
      .innerJoin(films, eq(screenings.filmId, films.id))
      .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
      .where(and(eq(festivalScreenings.festivalId, festival.id), gte(screenings.datetime, now)))
      .orderBy(asc(screenings.datetime));

    const sections = new Set<string>();
    for (const screening of screeningResults) {
      if (screening.festivalSection) {
        sections.add(screening.festivalSection);
      }
    }

    return NextResponse.json(
      {
        festival: {
          ...festival,
          status: computeFestivalStatus(festival.startDate, festival.endDate, now),
          ticketStatus: computeTicketStatus(festival, now),
          screeningCount: screeningResults.length,
        },
        screenings: screeningResults,
        meta: {
          screeningCount: screeningResults.length,
          // Past screenings are filtered out above, so every row is upcoming.
          upcomingCount: screeningResults.length,
          sections: Array.from(sections).sort(),
        },
      },
      { headers: CACHE_2MIN }
    );
  } catch (error) {
    return handleApiError(error, "GET /api/festivals/[slug]");
  }
}
