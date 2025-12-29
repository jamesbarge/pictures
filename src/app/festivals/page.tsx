/**
 * Festivals Page
 * Lists all London film festivals with filtering and follow functionality
 */

// Force dynamic rendering for user-specific follow status
export const dynamic = "force-dynamic";

import { db } from "@/db";
import { festivals, userFestivalInterests } from "@/db/schema";
import { eq, and, gte, asc, sql } from "drizzle-orm";
import { FestivalList } from "@/components/festivals";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCurrentUserId } from "@/lib/auth";

export default async function FestivalsPage() {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
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
      .where(eq(festivals.isActive, true))
      .orderBy(asc(festivals.startDate));
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
      .where(eq(festivals.isActive, true))
      .orderBy(asc(festivals.startDate));
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

    // Convert dates to ISO strings for client components
    return {
      ...festival,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      memberSaleDate: festival.memberSaleDate
        ? new Date(festival.memberSaleDate).toISOString()
        : null,
      publicSaleDate: festival.publicSaleDate
        ? new Date(festival.publicSaleDate).toISOString()
        : null,
      status,
      ticketStatus,
    };
  });

  // Count stats
  const ongoingCount = festivalsWithStatus.filter((f) => f.status === "ongoing").length;
  const upcomingCount = festivalsWithStatus.filter((f) => f.status === "upcoming").length;

  return (
    <div className="min-h-screen bg-background-primary pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background-primary/95 backdrop-blur-sm border-b border-border-subtle">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back to Calendar</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display text-text-primary mb-2">
            London Film Festivals
          </h1>
          <p className="text-text-secondary">
            Discover and follow film festivals across London.
            {ongoingCount > 0 && (
              <span className="text-accent-success">
                {" "}
                {ongoingCount} festival{ongoingCount !== 1 ? "s" : ""} happening now.
              </span>
            )}
            {upcomingCount > 0 && ongoingCount === 0 && (
              <span>
                {" "}
                {upcomingCount} upcoming festival{upcomingCount !== 1 ? "s" : ""}.
              </span>
            )}
          </p>
        </div>

        {/* Festival list */}
        <FestivalList festivals={festivalsWithStatus} />
      </div>
    </div>
  );
}

export const metadata = {
  title: "Film Festivals | Postboxd",
  description: "London film festivals - BFI LFF, Raindance, FrightFest, LSFF and more",
};
