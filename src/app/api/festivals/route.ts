/**
 * Festivals API Route
 * GET /api/festivals - List festivals
 */

import { NextResponse } from "next/server";

import { CACHE_5MIN } from "@/lib/cache-headers";
import { db } from "@/db";
import { festivals } from "@/db/schema";
import { asc } from "drizzle-orm";
import { handleApiError } from "@/lib/api-errors";

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

export async function GET() {
  try {
    const results = await db
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
      })
      .from(festivals)
      .orderBy(asc(festivals.startDate))
      .limit(50);

    // Compute status for each festival
    const now = new Date();
    const festivalsWithStatus = results.map((festival) => ({
      ...festival,
      status: computeFestivalStatus(festival.startDate, festival.endDate, now),
      ticketStatus: computeTicketStatus(festival, now),
    }));

    return NextResponse.json(
      {
        festivals: festivalsWithStatus,
        meta: { total: festivalsWithStatus.length },
      },
      { headers: CACHE_5MIN }
    );
  } catch (error) {
    return handleApiError(error, "GET /api/festivals");
  }
}
