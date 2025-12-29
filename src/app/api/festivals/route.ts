/**
 * Festivals API Route
 * GET /api/festivals - List festivals with filtering
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { festivals, userFestivalInterests } from "@/db/schema";
import { eq, and, gte, lte, desc, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { BadRequestError, handleApiError } from "@/lib/api-errors";
import { getCurrentUserId } from "@/lib/auth";

// Input validation schema
const querySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2030).optional(),
  active: z.enum(["true", "false"]).optional(),
  upcoming: z.enum(["true", "false"]).optional(),
  genre: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Validate query parameters
    const parseResult = querySchema.safeParse({
      year: searchParams.get("year") || undefined,
      active: searchParams.get("active") || undefined,
      upcoming: searchParams.get("upcoming") || undefined,
      genre: searchParams.get("genre") || undefined,
      limit: searchParams.get("limit") || undefined,
    });

    if (!parseResult.success) {
      throw new BadRequestError(
        "Invalid query parameters",
        parseResult.error.flatten()
      );
    }

    const params = parseResult.data;
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Build query conditions
    const conditions = [];

    if (params.year) {
      conditions.push(eq(festivals.year, params.year));
    }

    if (params.active === "true") {
      conditions.push(eq(festivals.isActive, true));
    } else if (params.active === "false") {
      conditions.push(eq(festivals.isActive, false));
    }

    // Upcoming = hasn't ended yet
    if (params.upcoming === "true") {
      conditions.push(gte(festivals.endDate, today));
    }

    if (params.genre) {
      // Check if genre is in the genre_focus array
      conditions.push(
        sql`${params.genre} = ANY(${festivals.genreFocus})`
      );
    }

    // Get current user for follow status (optional)
    const userId = await getCurrentUserId();

    // Fetch festivals with optional follow status
    let results;

    if (userId) {
      // Include follow status for authenticated users
      results = await db
        .select({
          id: festivals.id,
          name: festivals.name,
          slug: festivals.slug,
          shortName: festivals.shortName,
          year: festivals.year,
          description: festivals.description,
          websiteUrl: festivals.websiteUrl,
          logoUrl: festivals.logoUrl,
          startDate: festivals.startDate,
          endDate: festivals.endDate,
          programmAnnouncedDate: festivals.programmAnnouncedDate,
          memberSaleDate: festivals.memberSaleDate,
          publicSaleDate: festivals.publicSaleDate,
          genreFocus: festivals.genreFocus,
          venues: festivals.venues,
          isActive: festivals.isActive,
          // User's follow status
          isFollowing: sql<boolean>`${userFestivalInterests.userId} IS NOT NULL`,
          interestLevel: userFestivalInterests.interestLevel,
        })
        .from(festivals)
        .leftJoin(
          userFestivalInterests,
          and(
            eq(userFestivalInterests.festivalId, festivals.id),
            eq(userFestivalInterests.userId, userId)
          )
        )
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(festivals.startDate))
        .limit(params.limit || 50);
    } else {
      // Anonymous users - no follow status
      results = await db
        .select({
          id: festivals.id,
          name: festivals.name,
          slug: festivals.slug,
          shortName: festivals.shortName,
          year: festivals.year,
          description: festivals.description,
          websiteUrl: festivals.websiteUrl,
          logoUrl: festivals.logoUrl,
          startDate: festivals.startDate,
          endDate: festivals.endDate,
          programmAnnouncedDate: festivals.programmAnnouncedDate,
          memberSaleDate: festivals.memberSaleDate,
          publicSaleDate: festivals.publicSaleDate,
          genreFocus: festivals.genreFocus,
          venues: festivals.venues,
          isActive: festivals.isActive,
          isFollowing: sql<boolean>`false`,
          interestLevel: sql<string | null>`null`,
        })
        .from(festivals)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(festivals.startDate))
        .limit(params.limit || 50);
    }

    // Compute status for each festival
    const festivalsWithStatus = results.map((festival) => {
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
        const memberSale = festival.memberSaleDate ? new Date(festival.memberSaleDate) : null;

        if (now >= publicSale) {
          ticketStatus = "on_sale";
        } else if (memberSale && now >= memberSale) {
          ticketStatus = "member_sale";
        } else {
          ticketStatus = "not_announced";
        }
      }

      return {
        ...festival,
        status,
        ticketStatus,
      };
    });

    return NextResponse.json(
      {
        festivals: festivalsWithStatus,
        meta: {
          total: festivalsWithStatus.length,
          filters: {
            year: params.year || null,
            active: params.active || null,
            upcoming: params.upcoming || null,
            genre: params.genre || null,
          },
        },
      },
      {
        headers: {
          // Cache for 5 minutes, serve stale for 10 min while revalidating
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    return handleApiError(error, "GET /api/festivals");
  }
}
