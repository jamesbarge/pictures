/**
 * Festival Detail API Route
 * GET /api/festivals/[slug] - Get festival details with screenings
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  festivals,
  festivalScreenings,
  screenings,
  films,
  cinemas,
  userFestivalInterests,
  userFestivalSchedule,
} from "@/db/schema";
import { eq, and, asc, sql, gte } from "drizzle-orm";
import { z } from "zod";
import { BadRequestError, NotFoundError, handleApiError } from "@/lib/api-errors";
import { getCurrentUserId } from "@/lib/auth";

// Query params validation
const querySchema = z.object({
  includeScreenings: z.enum(["true", "false"]).optional(),
  includePast: z.enum(["true", "false"]).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const searchParams = request.nextUrl.searchParams;

    // Validate query parameters
    const parseResult = querySchema.safeParse({
      includeScreenings: searchParams.get("includeScreenings") || "true",
      includePast: searchParams.get("includePast") || "false",
    });

    if (!parseResult.success) {
      throw new BadRequestError(
        "Invalid query parameters",
        parseResult.error.flatten()
      );
    }

    const queryParams = parseResult.data;
    const includeScreenings = queryParams.includeScreenings !== "false";
    const includePast = queryParams.includePast === "true";

    // Get current user (optional)
    const userId = await getCurrentUserId();

    // Fetch the festival
    const [festival] = await db
      .select()
      .from(festivals)
      .where(eq(festivals.slug, slug))
      .limit(1);

    if (!festival) {
      throw new NotFoundError(`Festival not found: ${slug}`);
    }

    // Get user's follow status if authenticated
    let followStatus = null;
    if (userId) {
      const [interest] = await db
        .select()
        .from(userFestivalInterests)
        .where(
          and(
            eq(userFestivalInterests.userId, userId),
            eq(userFestivalInterests.festivalId, festival.id)
          )
        )
        .limit(1);

      if (interest) {
        followStatus = {
          isFollowing: true,
          interestLevel: interest.interestLevel,
          notifyOnSale: interest.notifyOnSale,
          notifyProgramme: interest.notifyProgramme,
          notifyReminders: interest.notifyReminders,
        };
      }
    }

    // Compute festival status
    const now = new Date();
    const startDate = new Date(festival.startDate);
    const endDate = new Date(festival.endDate);

    let status: "upcoming" | "ongoing" | "past";
    if (now < startDate) {
      status = "upcoming";
    } else if (now > endDate) {
      status = "past";
    } else {
      status = "ongoing";
    }

    // Compute ticket sale status
    let ticketStatus: "not_announced" | "member_sale" | "public_sale" | "on_sale" | null = null;
    if (festival.publicSaleDate) {
      const publicSale = new Date(festival.publicSaleDate);
      const memberSale = festival.memberSaleDate
        ? new Date(festival.memberSaleDate)
        : null;

      if (now >= publicSale) {
        ticketStatus = "on_sale";
      } else if (memberSale && now >= memberSale) {
        ticketStatus = "member_sale";
      } else {
        ticketStatus = "not_announced";
      }
    }

    // Build response
    const response: {
      festival: typeof festival & {
        status: string;
        ticketStatus: string | null;
        followStatus: typeof followStatus;
        screeningCount?: number;
      };
      screenings?: Array<{
        id: string;
        datetime: Date;
        format: string | null;
        screen: string | null;
        eventType: string | null;
        eventDescription: string | null;
        bookingUrl: string;
        availabilityStatus: string | null;
        festivalSection: string | null;
        isPremiere: boolean;
        premiereType: string | null;
        isInSchedule?: boolean;
        scheduleStatus?: string | null;
        film: {
          id: string;
          title: string;
          year: number | null;
          directors: string[];
          posterUrl: string | null;
          runtime: number | null;
        };
        cinema: {
          id: string;
          name: string;
          shortName: string | null;
        };
      }>;
      meta: {
        screeningCount: number;
        upcomingCount: number;
        sections: string[];
      };
    } = {
      festival: {
        ...festival,
        status,
        ticketStatus,
        followStatus,
      },
      meta: {
        screeningCount: 0,
        upcomingCount: 0,
        sections: [],
      },
    };

    // Fetch screenings if requested
    if (includeScreenings) {
      // Build conditions for screenings
      const screeningConditions = [eq(festivalScreenings.festivalId, festival.id)];

      if (!includePast) {
        screeningConditions.push(gte(screenings.datetime, now));
      }

      // Base query for screenings
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
        .where(and(...screeningConditions))
        .orderBy(asc(screenings.datetime));

      // If user is logged in, get their schedule status for these screenings
      let userScheduleMap = new Map<string, { status: string }>();
      if (userId && screeningResults.length > 0) {
        const screeningIds = screeningResults.map((s) => s.id);
        const scheduleItems = await db
          .select({
            screeningId: userFestivalSchedule.screeningId,
            status: userFestivalSchedule.status,
          })
          .from(userFestivalSchedule)
          .where(
            and(
              eq(userFestivalSchedule.userId, userId),
              eq(userFestivalSchedule.festivalId, festival.id)
            )
          );

        for (const item of scheduleItems) {
          userScheduleMap.set(item.screeningId, { status: item.status });
        }
      }

      // Add user schedule status to screenings
      response.screenings = screeningResults.map((screening) => {
        const scheduleItem = userScheduleMap.get(screening.id);
        return {
          ...screening,
          isInSchedule: !!scheduleItem,
          scheduleStatus: scheduleItem?.status || null,
        };
      });

      // Compute meta
      const sections = new Set<string>();
      let upcomingCount = 0;

      for (const screening of screeningResults) {
        if (screening.festivalSection) {
          sections.add(screening.festivalSection);
        }
        if (new Date(screening.datetime) >= now) {
          upcomingCount++;
        }
      }

      response.meta = {
        screeningCount: screeningResults.length,
        upcomingCount,
        sections: Array.from(sections).sort(),
      };
      response.festival.screeningCount = screeningResults.length;
    } else {
      // Just get counts without full screening data
      const [countResult] = await db
        .select({
          total: sql<number>`count(*)::int`,
          upcoming: sql<number>`count(*) filter (where ${screenings.datetime} >= now())::int`,
        })
        .from(festivalScreenings)
        .innerJoin(screenings, eq(festivalScreenings.screeningId, screenings.id))
        .where(eq(festivalScreenings.festivalId, festival.id));

      response.meta = {
        screeningCount: countResult?.total || 0,
        upcomingCount: countResult?.upcoming || 0,
        sections: [],
      };
      response.festival.screeningCount = countResult?.total || 0;
    }

    return NextResponse.json(response, {
      headers: {
        // Cache for 2 minutes (festival data changes less frequently)
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/festivals/[slug]");
  }
}
